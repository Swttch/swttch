import { useTranslation } from '@/i18n';
import { useChatStreamContext } from '@/contexts/ChatStreamContext';

/**
 * The messages sent while a permission card holds the running turn, drawn in the conversation as the desktop app
 * draws them: an ordinary message bubble, and under it "Send now", which hands that one to the running turn instead of
 * after it. They leave here when the backend releases them to the CLI, and come back as ordinary messages.
 */
export function TranscriptHeldMessages() {
  const { t } = useTranslation('chat');
  const { queuedMessages, steerQueuedMessage } = useChatStreamContext();
  if (queuedMessages.length === 0) return null;
  return (
    <>
      {queuedMessages.map((message) => (
        <div key={message.id} className="flex flex-col items-end gap-1.5 pt-2 pb-[24px] px-4" data-transcript-held-message>
          <div className="max-w-[37rem] min-w-0 rounded-2xl bg-surface-hover px-3.5 py-2">
            <div className="text-text-primary/80 text-[1rem] leading-[1.5] whitespace-pre-wrap break-words">{message.content}</div>
          </div>
          <button
            type="button"
            data-testid="held-message-send-now"
            onClick={() => steerQueuedMessage(message.id)}
            className="px-1 text-[0.9231rem] text-[var(--tr-muted)] hover:text-text-primary"
          >
            {t('chatPage.sendHeldNow')}
          </button>
        </div>
      ))}
    </>
  );
}
