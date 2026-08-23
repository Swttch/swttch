import { useEffect, useId, useRef } from 'react';
import { useTranslation } from '@/i18n';
import type { HunkDecisions } from './useHunkDecisions';

interface Props {
  decisions: HunkDecisions;
  disabled?: boolean;
}

/**
 * Accept every hunk at once, or put them all back.
 *
 * A checkbox rather than a pair of buttons: "all accepted" and "none decided"
 * are two states of one question, and naming both left the header reading like
 * separate actions — two of which only moved state around while a third wrote
 * to disk.
 *
 * Unticking returns every hunk to UNDECIDED, not to denied. Clearing a
 * selection should not itself be a decision, and this way nothing the reviewer
 * typed is lost — it is the same thing Back does, applied to the whole file.
 *
 * Part-way through shows as indeterminate, a state a pair of buttons cannot
 * express at all. Clicking from there accepts everything, matching the
 * behaviour of every file list that has this control.
 */
export function SelectAllHunks({ decisions, disabled }: Props) {
  const { t } = useTranslation('chat');
  const id = useId();
  const ref = useRef<HTMLInputElement>(null);

  const all = decisions.allAccepted;
  const none = decisions.openCount === decisions.total;

  // `indeterminate` is a DOM property, not an attribute — React will not set it
  // from JSX, so it has to be written to the node after each render.
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = !all && !none;
  }, [all, none]);

  return (
    <span className="flex items-center gap-1.5">
      <input
        ref={ref}
        id={id}
        type="checkbox"
        checked={all}
        disabled={disabled}
        onChange={() => (all ? decisions.resetAll() : decisions.acceptAll())}
        className="h-3.5 w-3.5 cursor-pointer accent-state-success-fg disabled:cursor-not-allowed disabled:opacity-50"
      />
      <label htmlFor={id} className="cursor-pointer select-none text-xs text-text-secondary">
        {t('diffPage.hunk.selectAll')}
      </label>
    </span>
  );
}
