import { useTranslation } from '@/i18n';

interface Props {
  /** The next Up leaves the draft for the history. */
  guarded: boolean;
  /** Something is written in the box, which the walk will keep. */
  hasDraft: boolean;
}

/**
 * The line over the text of the composer that says where the arrow keys are in the history (#735): ahead of the first
 * step out of the draft, what the next press does.
 */
export function HistoryNotice({ guarded, hasDraft }: Props) {
  const { t } = useTranslation('chat');
  if (!guarded) return null;

  return (
    <div role="status" className="select-none ps-3 pe-11 pb-0.5 text-xs text-text-tertiary">
      {t(hasDraft ? 'chatInput.history.guardKeepsDraft' : 'chatInput.history.guard')}
    </div>
  );
}
