import { useTranslation } from '@/i18n';

interface Props {
  /** Whether this hunk will be written. */
  kept: boolean;
  /** Flip it. */
  onToggle: () => void;
}

/**
 * Keep-or-drop for one hunk, drawn beside the change it decides.
 *
 * Beside the change rather than in a list at the top: the whole reason to split
 * a proposal is that the parts differ, and a control that names a hunk by number
 * makes the reviewer hold that mapping in their head.
 *
 * Two states of one control rather than an accept button and a reject button.
 * Every hunk starts kept — the reviewer is reading a proposal, not assembling
 * one — so what they do is take things OUT, and a pair of buttons would leave
 * the current state unsaid.
 */
export function HunkControl({ kept, onToggle }: Props) {
  const { t } = useTranslation('chat');

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={kept}
      className={`rounded border px-2 py-0.5 text-xs transition-colors ${
        kept
          ? 'border-state-success-fg/40 bg-state-success-bg text-state-success-fg'
          : 'border-border-default bg-surface-overlay text-text-tertiary'
      }`}
    >
      {kept ? t('diffPage.hunk.kept') : t('diffPage.hunk.dropped')}
    </button>
  );
}
