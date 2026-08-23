import { useId } from 'react';
import { useTranslation } from '@/i18n';

interface Props {
  /** Whether this hunk will be written. */
  kept: boolean;
  /** Flip it. */
  onToggle: () => void;
}

/**
 * Whether one hunk is included, drawn beside the change it decides.
 *
 * Beside the change rather than in a list at the top: the whole reason to split
 * a proposal is that the parts differ, and a control that names a hunk by number
 * makes the reviewer hold that mapping in their head.
 *
 * A checkbox, like the select-all in the header — one ticks a hunk, the other
 * ticks them all, and two shapes for one action would read as two features.
 *
 * It carries no label. The word would have to be a state ("included") next to a
 * header that gives commands ("Confirm"), and a reader should not have to work
 * out whether a control is telling them something or asking them something. A
 * tick answers that on sight.
 */
export function HunkControl({ kept, onToggle }: Props) {
  const { t } = useTranslation('chat');
  const id = useId();

  return (
    <input
      id={id}
      type="checkbox"
      checked={kept}
      onChange={onToggle}
      // Named for screen readers and for hover, since nothing is written next
      // to it.
      aria-label={t('diffPage.hunk.include')}
      title={t('diffPage.hunk.include')}
      className="h-3.5 w-3.5 cursor-pointer accent-state-success-fg"
    />
  );
}
