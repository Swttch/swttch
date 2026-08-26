/**
 * Guard a pending review against the file moving underneath it (#359).
 *
 * A review is built once, from the file as it was when `can_use_tool` arrived,
 * and then waits for a human. Meanwhile the file is still live: the user edits
 * it in the IDE, another session writes it, a rebase lands. Nothing re-read it,
 * so approving wrote the old snapshot back over whatever had arrived — a
 * 1090-line file came back as the single line that had been proposed, taking
 * uncommitted work with it.
 *
 * So the stored `oldContent` is treated as a claim about disk that expires. It
 * is checked when the IDE reports a save, and again at the moment of approval,
 * because a watcher can miss and the approval must not.
 *
 * The check is by content, not mtime: a save that rewrites identical bytes is
 * not a change worth interrupting a review for, and mtime moves for reasons
 * that have nothing to do with content (a checkout that restores the same
 * text, a tool rewriting a file in place).
 */
import { readFile } from 'fs/promises';
import { computeHunks, type AcceptedRange } from './hunks';
import { MessageType } from '../../shared';
import type { StoredPreview } from './diffPreview';

/** How the file on disk now compares to the content a review was built from. */
export type BaseComparison =
  | { status: 'unchanged' }
  /**
   * Disk moved, but not under anything the reviewer kept — the proposal can be
   * restated against current content without any decision changing meaning.
   */
  | { status: 'changed'; currentContent: string; overlapsAccepted: false }
  /**
   * Disk moved under a region the reviewer accepted. Both sides claim the same
   * lines, and nothing here can tell which one the user meant to keep.
   */
  | { status: 'changed'; currentContent: string; overlapsAccepted: true }
  /**
   * The file could not be read at all (deleted, or permissions changed). Not a
   * conflict to resolve — there is no content to restate the proposal against.
   */
  | { status: 'unreadable' };

/**
 * Read [filePath] as it is now, or null when it cannot be read.
 *
 * A missing file is null rather than an empty string: for a Write creating a
 * new file the preview's own base is `''`, and conflating "not there" with
 * "there and empty" would report a change on every such review.
 */
export async function readCurrentContent(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, 'utf8');
  } catch {
    return null;
  }
}

/**
 * Whether the file still matches what [preview] was built from, and if not,
 * whether the difference lands on a region the reviewer accepted.
 *
 * [accepted] is the reviewer's selection when there is one. Omit it while the
 * review is still open — before any decision, every changed region is worth
 * reporting, and treating that as "no overlap" would let a conflicting change
 * pass unmentioned until approval.
 */
export async function compareReviewBase(
  preview: Pick<StoredPreview, 'filePath' | 'oldContent'>,
  accepted?: readonly AcceptedRange[],
): Promise<BaseComparison> {
  const current = await readCurrentContent(preview.filePath);

  // A new file (base '') that still does not exist has not changed. Reading
  // null for a file whose base has content is a real loss of the base.
  if (current === null) {
    return preview.oldContent === '' ? { status: 'unchanged' } : { status: 'unreadable' };
  }

  if (current === preview.oldContent) return { status: 'unchanged' };

  return {
    status: 'changed',
    currentContent: current,
    overlapsAccepted: overlapsAcceptedRegions(preview.oldContent, current, accepted),
  };
}

/**
 * The one gate every approval passes through before it is answered (#359).
 *
 * Returns true when the answer must NOT go out, having already told the review
 * surface why. Returns false when the file still matches and the caller may
 * answer normally.
 *
 * Shared rather than copied because there are two approval paths — the review
 * diff's own Confirm (RESOLVE_DIFF) and the chat prompt's Yes (TOOL_RESPONSE) —
 * and the second was where the reporter actually pressed. A check written into
 * one of them is not a fix; it is a fix for whichever button the next reporter
 * happens not to press.
 *
 * The caller must NOT have consumed the preview before calling this: a held
 * approval has to stay answerable, and an entry already taken leaves the
 * buttons live with nothing behind them.
 */
export async function holdApprovalIfBaseMoved(params: {
  connections: { broadcastToSession: (sessionId: string, type: string, payload: Record<string, unknown>) => void };
  sessionId: string;
  toolUseId: string;
  preview: Pick<StoredPreview, 'filePath' | 'oldContent'>;
  /** The reviewer's selection, when the surface reported one. */
  accepted?: readonly AcceptedRange[];
}): Promise<boolean> {
  const base = await compareReviewBase(params.preview, params.accepted);
  if (base.status === 'unchanged') return false;

  params.connections.broadcastToSession(params.sessionId, MessageType.REVIEW_BASE_CHANGED, {
    toolUseId: params.toolUseId,
    filePath: params.preview.filePath,
    // Told apart so the surface can say which one happened: a conflicting edit
    // is a decision for the user, an unreadable file is not.
    reason: base.status === 'unreadable' ? 'unreadable' : 'changed',
    overlapsAccepted: base.status === 'changed' ? base.overlapsAccepted : true,
    // Marks this as the gate rather than the early warning, so the surface can
    // say the approval was held rather than only flagging a change.
    blockedApproval: true,
  });

  console.error(
    '[node-backend]',
    `Approval for ${params.toolUseId} HELD: ${params.preview.filePath} changed since the review was built (${base.status})`,
  );
  return true;
}

/**
 * Whether the disk change touches lines the reviewer chose to keep.
 *
 * With no selection yet, every change counts as overlapping: the reviewer has
 * not ruled anything out, so the change may land under whatever they go on to
 * accept. Reporting it is the honest default — the alternative is staying quiet
 * about a change and then discovering the conflict at approval.
 *
 * Line numbers are compared on the OLD side, which both the accepted ranges and
 * the disk diff are stated against — that shared origin is what makes them
 * comparable at all. The proposed side has its own numbering and cannot be
 * lined up with disk without re-deriving the whole change.
 */
export function overlapsAcceptedRegions(
  base: string,
  current: string,
  accepted?: readonly AcceptedRange[],
): boolean {
  if (accepted === undefined || accepted.length === 0) return true;

  const hunks = computeHunks(base, current);
  // Too large to split: we cannot say where it changed, so we cannot say it
  // missed the accepted regions.
  if (hunks === null) return true;
  if (hunks.length === 0) return false;

  return hunks.some((hunk) => {
    // Hunk line numbers are 1-based inclusive; AcceptedRange is 0-based
    // half-open. Convert the hunk to the range's frame before comparing --
    // mixing the two silently shifts every comparison by one line.
    const hunkStart = hunk.oldStart - 1;
    const hunkEnd = hunkStart + hunk.oldLines;
    return accepted.some((r) => r.oldStart < hunkEnd && hunkStart < r.oldEnd);
  });
}
