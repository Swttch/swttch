import { useEffect, useId, useRef } from 'react';
import { useTranslation } from '@/i18n';
import type { HunkSelection } from './useHunkSelection';

interface Props {
  selection: HunkSelection;
  disabled?: boolean;
}

/**
 * Tick or untick every hunk at once.
 *
 * A checkbox rather than a pair of buttons, and one label rather than two:
 * "select all" and "deselect all" are the two states of a single question, and
 * naming both left the header reading like four separate actions — two of which
 * only moved ticks around while a third wrote to disk.
 *
 * Partly-selected shows as indeterminate, which is a state a pair of buttons
 * cannot express at all. Clicking from there selects everything, matching the
 * behaviour of every file list that has this control.
 */
export function SelectAllHunks({ selection, disabled }: Props) {
  const { t } = useTranslation('chat');
  const id = useId();
  const ref = useRef<HTMLInputElement>(null);

  const all = selection.keptCount === selection.total;
  const none = selection.keptCount === 0;

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
        onChange={() => (all ? selection.dropAll() : selection.keepAll())}
        className="h-3.5 w-3.5 cursor-pointer accent-state-success-fg disabled:cursor-not-allowed disabled:opacity-50"
      />
      <label
        htmlFor={id}
        className="cursor-pointer text-xs text-text-secondary select-none"
      >
        {t('diffPage.hunk.selectAll')}
      </label>
    </span>
  );
}
