import { useTranslation } from '@/i18n';
import type { HunkDecision } from './useHunkDecisions';

interface Props {
  /** What has been decided here, or undefined while the hunk is still open. */
  decision: HunkDecision | undefined;
  /** Whether the reviewer has typed inside this hunk. */
  isEdited: boolean;
  onAccept: () => void;
  onDeny: () => void;
  /** Back to what Claude proposed, discarding anything typed here. */
  onReset: () => void;
  /** Back to what the reviewer typed, undoing only the decision. */
  onBack: () => void;
}

/**
 * What can be done to one hunk, floating over the code at its bottom-right.
 *
 * Four states, because two things vary independently — whether the hunk has
 * been answered, and whether it has been typed into:
 *
 *   open, untouched   Deny  Accept
 *   open, edited      Reset  Deny  Accept
 *   answered          Reset  Back
 *
 * Reset always means "back to what Claude proposed". Back means "back to what I
 * typed", so an answered hunk offers both: one drops the edit, the other keeps
 * it and only reopens the question. On a hunk that was never edited the two
 * land in the same place, which is harmless — the alternative is hiding a
 * control based on history the reviewer cannot see.
 *
 * Reset appears before the hunk is answered too. Otherwise the only way to
 * abandon a bad edit was to Accept it and then Reset, which is asking someone
 * to commit to something in order to undo it.
 *
 * Absolutely positioned rather than laid out in the flow: an element that took
 * a row of its own would push the two sides of the diff apart and add a line to
 * a file the reviewer is trying to read.
 */
export function HunkActions({ decision, isEdited, onAccept, onDeny, onReset, onBack }: Props) {
  const { t } = useTranslation('chat');

  const answered = decision !== undefined;

  return (
    <span className="pointer-events-none absolute bottom-0 right-2 flex gap-1 pb-0.5">
      {/* Leftmost in every state that has it, so it does not move as the hunk
          changes state under the reviewer's cursor. */}
      {(answered || isEdited) && (
        <button
          type="button"
          onClick={onReset}
          title={t('diffPage.hunk.resetHint')}
          className={SECONDARY_BUTTON}
        >
          {t('diffPage.hunk.reset')}
        </button>
      )}

      {answered ? (
        <button
          type="button"
          onClick={onBack}
          title={t('diffPage.hunk.backHint')}
          className={SECONDARY_BUTTON}
        >
          {t('diffPage.hunk.back')}
        </button>
      ) : (
        <>
          <button type="button" onClick={onDeny} className={SECONDARY_BUTTON}>
            {t('diffPage.hunk.deny')}
          </button>
          <button
            type="button"
            onClick={onAccept}
            className="pointer-events-auto rounded border border-state-success-fg/40 bg-state-success-bg px-2 py-0.5 text-xs text-state-success-fg shadow-sm transition-colors hover:brightness-110"
          >
            {t('diffPage.hunk.accept')}
          </button>
        </>
      )}
    </span>
  );
}

/** Every control here except Accept, which is the one affirmative action. */
const SECONDARY_BUTTON =
  'pointer-events-auto rounded border border-border-default bg-surface-overlay px-2 py-0.5 text-xs text-text-secondary shadow-sm transition-colors hover:bg-surface-hover';
