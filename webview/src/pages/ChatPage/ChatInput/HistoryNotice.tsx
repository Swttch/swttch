import { useTranslation } from '@/i18n';

interface Props {
  /** The send shown, counted from the oldest, or null while the box holds the draft. */
  position: { index: number; total: number } | null;
  /** The next Up leaves the draft for the history. */
  guarded: boolean;
  /** Something is written in the box, which the walk will keep. */
  hasDraft: boolean;
}

/**
 * The line over the text of the composer that says where the arrow keys are in the history (#735): ahead of the first
 * step out of the draft, what the next press does, and during the walk, which send is shown.
 */
export function HistoryNotice({ position, guarded, hasDraft }: Props) {
  const { t } = useTranslation('chat');
  if (!position && !guarded) return null;

  return (
    <div role="status" className="select-none ps-3 pe-11 pb-0.5 text-xs text-text-tertiary tabular-nums">
      {position
        ? t('chatInput.history.position', position)
        : t(hasDraft ? 'chatInput.history.guardKeepsDraft' : 'chatInput.history.guard')}
    </div>
  );
}
