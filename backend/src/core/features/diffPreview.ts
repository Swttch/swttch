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
): Promise<{ filePath: string; oldContent: string; newContent: string } | null> {
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

  return { filePath, oldContent, newContent: proposed };
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
  toolName: string,
  toolUseId: string | undefined,
  input: Record<string, unknown>,
): Promise<void> {
  try {
    const preview = await resolveDiffPreview(toolName, input);
    if (!preview) return;
    await bridge.openDiff({ ...preview, toolUseId });
  } catch (err) {
    console.error('[node-backend]', 'Failed to open IDE diff for permission request:', err);
  }
}
