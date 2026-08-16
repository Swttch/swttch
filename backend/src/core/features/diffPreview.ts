/**
 * Show Claude's proposed file edit in the IDE's diff viewer while the
 * permission prompt is up, so the user can see WHAT they are approving
 * instead of just the file name (issues #41, #109).
 *
 * This is a side effect of watching the CLI stream: the `can_use_tool`
 * control_request still reaches the WebView untouched, and the approval
 * buttons stay where they were. Nothing here writes to disk — the diff is a
 * preview of what the CLI would write if the user says yes.
 */
import { readFile } from 'fs/promises';
import type { Bridge } from '../../bridge/bridge-interface';
import { computeProposedContent, extractFilePath, isFileEditingTool } from './proposedEdit';
import { computeHunks, type Hunk } from './hunks';

export interface StoredPreview {
  filePath: string;
  oldContent: string;
  newContent: string;
  hunks: Hunk[];
  /** The tool input as the CLI sent it, so a partial accept can amend a copy. */
  input: Record<string, unknown>;
  toolName: string;
  /**
   * Who to answer when the IDE resolves this diff. Stored so a diff reopened
   * from the approval prompt can answer the same request the first one would
   * have — without them, its Apply would have nowhere to send the decision.
   */
  sessionId?: string;
  controlRequestId?: string;
}

/**
 * Previews for permission requests still awaiting an answer, keyed by
 * tool_use_id.
 *
 * Kept backend-side so a partial approval sends back only the hunk numbers the
 * user kept: the file contents never make a round trip through the WebView,
 * and the text written is the text we diffed rather than something reassembled
 * from what the browser happened to render.
 *
 * Entries are dropped as soon as the request is answered. A turn that dies
 * without answering leaks one small entry per pending edit, which the cap
 * below sweeps rather than tracking process lifetimes.
 */
const previews = new Map<string, StoredPreview>();
const MAX_PENDING_PREVIEWS = 100;

export function rememberPreview(toolUseId: string, preview: StoredPreview): void {
  if (previews.size >= MAX_PENDING_PREVIEWS) {
    // Oldest first: Map preserves insertion order, and an unanswered request
    // this far back is not coming back.
    const oldest = previews.keys().next().value;
    if (oldest !== undefined) previews.delete(oldest);
  }
  previews.set(toolUseId, preview);
}

export function takePreview(toolUseId: string): StoredPreview | undefined {
  const preview = previews.get(toolUseId);
  previews.delete(toolUseId);
  return preview;
}

/**
 * Read a preview without consuming it, for reopening a diff whose question is
 * still on screen — the user can close the diff and then click the file name in
 * the prompt to bring it back. The answer still needs this entry afterwards, so
 * unlike [takePreview] it stays.
 */
export function peekPreview(toolUseId: string): StoredPreview | undefined {
  return previews.get(toolUseId);
}

/** Exposed for tests; production code drops entries via takePreview. */
export function clearPreviews(): void {
  previews.clear();
}

/** Reads the file, or null when it does not exist yet (Write creating one). */
async function readOriginal(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, 'utf8');
  } catch {
    // ENOENT is the common case and means "new file". Any other read error
    // (permissions, a directory) is equally un-previewable, so both land here.
    return null;
  }
}

/**
 * The diff a `can_use_tool` request should show, or null when there is nothing
 * faithful to show. Split out from the opening so the decision is testable
 * without a Bridge or a real IDE.
 */
export async function resolveDiffPreview(
  toolName: string,
  input: Record<string, unknown>,
): Promise<{ filePath: string; oldContent: string; newContent: string; hunks: Hunk[] } | null> {
  if (!isFileEditingTool(toolName)) return null;

  const filePath = extractFilePath(input);
  if (!filePath) return null;

  const originalContent = await readOriginal(filePath);
  const proposed = computeProposedContent(toolName, input, originalContent);
  if (proposed === null) return null;

  // A preview that matches the file exactly is a no-op edit — opening a diff
  // with no differences just adds a tab the user has to close.
  const oldContent = originalContent ?? '';
  if (proposed === oldContent) return null;

  // A diff too large to split is still worth showing whole — the user keeps
  // the all-or-nothing approval they had, just with the change visible.
  const hunks = computeHunks(oldContent, proposed) ?? [];

  return { filePath, oldContent, newContent: proposed, hunks };
}

/**
 * Open the IDE diff for a pending file-edit permission request.
 *
 * Never throws and never blocks the caller: the permission prompt is the thing
 * the user is waiting on, and a diff we could not open must not hold it up or
 * take the turn down with it. A host with no IDE attached resolves to a no-op
 * bridge, which is why the caller does not have to check the mode itself.
 */
export async function openDiffForPermission(
  bridge: Bridge,
  preview: { filePath: string; oldContent: string; newContent: string },
  toolUseId: string | undefined,
  ids?: { sessionId: string; controlRequestId: string },
): Promise<void> {
  try {
    await bridge.openDiff({
      filePath: preview.filePath,
      oldContent: preview.oldContent,
      newContent: preview.newContent,
      toolUseId,
      sessionId: ids?.sessionId,
      controlRequestId: ids?.controlRequestId,
    });
  } catch (err) {
    console.error('[node-backend]', 'Failed to open IDE diff for permission request:', err);
  }
}
