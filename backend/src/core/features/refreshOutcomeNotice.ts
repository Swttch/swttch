/**
 * What to tell the IDE's diff after a refresh it asked for (#359).
 *
 * Three answers, and the difference matters because the reviewer's next move
 * differs:
 *
 *  - rebuilt      → redraw the review; they decide again against current content
 *  - unrebuildable → restate the banner; there is nothing to rebuild, so the
 *                    only ways out are Reject or asking Claude again
 *  - nothing       → already current or already answered; the screen is right
 *
 * Leaving the unrebuildable case silent was a dead end: the banner still said
 * "Refresh to see the current file and decide again", Refresh kept doing
 * nothing visible, and the approval stayed held. No way forward, no reason
 * given. The built-in surface already restates its banner here; this is what
 * lets the IDE's do the same.
 */
import type { RefreshOutcome } from './refreshReview';

export type RefreshNotice =
  /** Redraw the review with this proposed side. */
  | { kind: 'redraw'; filePath: string; oldContent: string; newContent: string }
  /** Leave the diff alone; say why it cannot be rebuilt. */
  | { kind: 'banner'; reason: 'unreadable' | 'no-longer-applies' }
  /** Say nothing. */
  | { kind: 'none' };

/**
 * Decide from [outcome] what the IDE should be told.
 *
 * [mergedProposal] is the proposed side after the reviewer's typing has been
 * carried across, which is what a redraw should show — not the raw rebuild.
 */
export function refreshOutcomeNotice(
  outcome: RefreshOutcome,
  mergedProposal: string,
): RefreshNotice {
  switch (outcome.status) {
    case 'refreshed':
      return {
        kind: 'redraw',
        filePath: outcome.preview.filePath,
        oldContent: outcome.preview.oldContent,
        newContent: mergedProposal,
      };
    case 'unrebuildable':
      return { kind: 'banner', reason: outcome.reason };
    default:
      // 'unchanged' — the screen already shows the current file. 'unknown' —
      // the request has been answered, so there is no review left to speak to.
      return { kind: 'none' };
  }
}
