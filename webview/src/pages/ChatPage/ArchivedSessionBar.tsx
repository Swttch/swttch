import { useSessionContext } from '@/contexts/SessionContext';
import { useTranslation } from '@/i18n';

/**
 * Stands where the chat input would be when the session is archived. An archived session is not worked in: the
 * input is not drawn, and the way on is offered in its place, which is to bring the session back.
 *
 * As in the desktop app, the sentence and the button share a line while there is room, and the button goes under
 * the sentence, at the start of the line, when there is not.
 */
export function ArchivedSessionBar({ sessionId }: { sessionId: string }) {
  const { t } = useTranslation('chat');
  const { setSessionArchived } = useSessionContext();

  return (
    <div role="status" data-testid="archived-session-bar" className="px-4 pb-2">
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-border-subtle bg-surface-raised px-3 py-2 text-[0.8461rem]">
        <span className="min-w-[22rem] flex-1 text-text-primary">{t('archivedSession.message')}</span>
        <button
          type="button"
          onClick={() => void setSessionArchived(sessionId, false)}
          className="shrink-0 rounded bg-surface-base px-3 py-1 text-[0.7692rem] font-medium text-text-primary hover:bg-surface-hover transition-colors"
        >
          {t('archivedSession.unarchive')}
        </button>
      </div>
    </div>
  );
}
