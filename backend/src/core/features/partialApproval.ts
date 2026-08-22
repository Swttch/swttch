/**
 * Turn "I accept these hunks, not those" into a tool input the CLI will honour
 * — the write half of issue #109.
 *
 * The CLI lets a permission response hand back an amended `updatedInput` and
 * uses it in place of what Claude proposed (verified against the CLI itself).
 * So a partial accept does not intercept the write: it rewrites the tool call
 * to describe exactly the subset the user kept, and the CLI writes as usual.
 *
 * ★ The amended input MUST keep the shape of the tool being answered. Handing
 * an Edit a Write-shaped input (`file_path` + `content`) is rejected by the CLI
 * with "File has not been read yet" — measured, not assumed. So a partial
 * accept of an Edit stays an Edit, with `old_string`/`new_string` widened to
 * span the whole region the hunks touch: old side as it is on disk now, new
 * side as it should end up. That pair is derived from the same content the
 * preview diffed, so `old_string` matches the file by construction.
 */
import { applyAcceptedRanges, type AcceptedRange } from './hunks';
import type { StoredPreview } from './diffPreview';

export interface PartialApproval {
  /** The amended input to hand back as `updatedInput`, in the tool's own shape. */
  input: Record<string, unknown>;
}

/**
 * The amended tool call for [accepted], or null when the request should proceed
 * unchanged.
 *
 * Null means "nothing to amend": the regions add up to the whole proposal, so
 * Claude's own input already says it. Rejecting everything is NOT expressed
 * here — that is a denial, and denying is the caller's job.
 *
 * [editedContent], when given, is the reviewer's own text for the whole file
 * and replaces the reassembly entirely (#305).
 */
export function buildPartialApproval(
  preview: StoredPreview,
  accepted: readonly AcceptedRange[],
  editedContent?: string,
): PartialApproval | null {
  // What the reviewer edited outranks what was proposed (#305). The viewer's
  // text IS the answer: hunk ranges describe the proposal it started from, so
  // reassembling from them would discard whatever was typed over it.
  const content =
    editedContent ?? applyAcceptedRanges(preview.oldContent, preview.newContent, accepted);
  if (content === null) return null;

  // Keeping everything reproduces the proposal, so let the original call
  // through untouched — an Edit stays an Edit, and the CLI's own bookkeeping
  // is undisturbed.
  if (content === preview.newContent) return null;

  // Write already states the whole file, so the subset just replaces it.
  if (preview.toolName === 'Write') {
    return { input: { ...preview.input, content } };
  }

  // Edit and MultiEdit must stay in Edit shape (see the module note). Narrow
  // the pair to the region that actually differs so the CLI is not handed the
  // entire file as one string — and so an unrelated concurrent change outside
  // that region does not make `old_string` stop matching.
  const pair = narrowToDifference(preview.oldContent, content);
  if (pair === null) return null;

  return {
    input: {
      file_path: preview.filePath,
      old_string: pair.oldText,
      new_string: pair.newText,
      replace_all: false,
    },
  };
}

/**
 * The smallest old/new pair that turns [oldContent] into [newContent], found by
 * trimming the common head and tail.
 *
 * Returns null when the two are identical — there is no edit to express, and
 * an Edit with an empty `old_string` is ambiguous to the CLI.
 *
 * The trim stops at a line boundary so the pair reads as whole lines in the
 * transcript rather than a fragment starting mid-token.
 */
function narrowToDifference(
  oldContent: string,
  newContent: string,
): { oldText: string; newText: string } | null {
  if (oldContent === newContent) return null;

  let head = 0;
  const maxHead = Math.min(oldContent.length, newContent.length);
  while (head < maxHead && oldContent[head] === newContent[head]) head++;
  // Back up to just after the last newline so the pair starts on a line.
  const lineStart = oldContent.lastIndexOf('\n', head - 1) + 1;
  head = lineStart;

  let tail = 0;
  const maxTail = Math.min(oldContent.length - head, newContent.length - head);
  while (
    tail < maxTail &&
    oldContent[oldContent.length - 1 - tail] === newContent[newContent.length - 1 - tail]
  ) {
    tail++;
  }
  // Advance to the start of a line so the pair ends on a line boundary.
  const oldTailStart = oldContent.length - tail;
  const nextNewline = oldContent.indexOf('\n', oldTailStart - 1);
  const boundedTailStart = nextNewline === -1 ? oldContent.length : nextNewline + 1;
  tail = oldContent.length - Math.max(head, boundedTailStart);

  const oldText = oldContent.slice(head, oldContent.length - tail);
  const newText = newContent.slice(head, newContent.length - tail);
  if (oldText === newText) return null;

  return { oldText, newText };
}

