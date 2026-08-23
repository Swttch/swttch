import { useTranslation } from '@/i18n';
import type { HunkDecision } from './useHunkDecisions';

interface Props {
  /** What has been decided here, or undefined while the hunk is still open. */
  decision: HunkDecision | undefined;
  onKeep: () => void;
  onUndo: () => void;
  onReset: () => void;
}

/**
 * The decision for one hunk, floating over the code at its bottom-right.
 *
 * Two buttons while the hunk is open, one to put it back once it is answered.
 * Both states occupy the same spot, so a reviewer working down the file always
 * finds the control in the same place relative to the change.
 *
 * Absolutely positioned rather than laid out in the flow: an element that took
 * a row of its own would push the two sides of the diff apart and add a line to
 * a file the reviewer is trying to read. It sits above the last line of the
 * hunk instead, which is dead space in the gutter-to-edge run.
 */
export function HunkActions({ decision, onKeep, onUndo, onReset }: Props) {
  const { t } = useTranslation('chat');

  return (
    <span className="pointer-events-none absolute bottom-0 right-2 flex gap-1 pb-0.5">
      {decision === undefined ? (
        <>
          <button
            type="button"
            onClick={onUndo}
            className="pointer-events-auto rounded border border-border-default bg-surface-overlay px-2 py-0.5 text-xs text-text-secondary shadow-sm transition-colors hover:bg-surface-hover"
          >
            {t('diffPage.hunk.undo')}
          </button>
          <button
            type="button"
            onClick={onKeep}
            className="pointer-events-auto rounded border border-state-success-fg/40 bg-state-success-bg px-2 py-0.5 text-xs text-state-success-fg shadow-sm transition-colors hover:brightness-110"
          >
            {t('diffPage.hunk.keep')}
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={onReset}
          // Named for what it undoes, so a reviewer who answered by mistake can
          // see the way back rather than reloading the window.
          title={
            decision === 'keep'
              ? t('diffPage.hunk.resetFromKeep')
              : t('diffPage.hunk.resetFromUndo')
          }
          className="pointer-events-auto rounded border border-border-default bg-surface-overlay px-2 py-0.5 text-xs text-text-tertiary shadow-sm transition-colors hover:bg-surface-hover hover:text-text-secondary"
        >
          {t('diffPage.hunk.reset')}
        </button>
      )}
    </span>
  );
}
