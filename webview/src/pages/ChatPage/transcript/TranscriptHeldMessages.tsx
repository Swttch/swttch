import { useTranslation } from '@/i18n';
import { useChatStreamContext } from '@/contexts/ChatStreamContext';

/**
 * The messages written while a permission card holds the running turn, drawn in the conversation as the desktop app
 * draws them: an ordinary message bubble, and under it "Send now". They are held in this view only (see
 * ChatStreamContext.heldMessages) and go out as ordinary messages when the card is answered.
 */
export function TranscriptHeldMessages() {
  const { t } = useTranslation('chat');
  const { heldMessages, sendHeldMessage } = useChatStreamContext();
  if (heldMessages.length === 0) return null;
  return (
    <>
      {heldMessages.map((message) => (
        <div key={message.id} className="flex flex-col items-end gap-1.5 pt-2 pb-[24px] px-4" data-transcript-held-message>
          <div className="max-w-[37rem] min-w-0 rounded-2xl bg-surface-hover px-3.5 py-2">
            <div className="text-text-primary/80 text-[1rem] leading-[1.5] whitespace-pre-wrap break-words">{message.content}</div>
          </div>
          <button
            type="button"
            data-testid="held-message-send-now"
            onClick={() => sendHeldMessage(message.id)}
            className="px-1 text-[0.9231rem] text-[var(--tr-muted)] hover:text-text-primary"
          >
            {t('chatPage.sendHeldNow')}
          </button>
        </div>
      ))}
    </>
  );
}
