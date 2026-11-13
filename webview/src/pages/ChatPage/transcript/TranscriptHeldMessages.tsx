import { useTranslation } from '@/i18n';
import { useChatStreamContext } from '@/contexts/ChatStreamContext';
import { USER_BUBBLE_CLASS } from './userBubble';

/**
 * The messages written while a permission card holds the running turn, drawn in the conversation as the desktop app
 * draws them: an ordinary message bubble, and under the first one "Send now". They are held in this view only (see
 * ChatStreamContext.heldMessages) and go out as ordinary messages when the card is answered.
 *
 * The spacing is the desktop app's, measured on its own screen (at this app's 90% scale): 61px of room above the first
 * bubble and 41px below the last, and the caption 10px lower than a plain gap and 6.5px further in.
 */
export function TranscriptHeldMessages({ atEnd = false }: { atEnd?: boolean } = {}) {
  const { t } = useTranslation('chat');
  const { heldMessages, sendHeldMessage } = useChatStreamContext();
  if (heldMessages.length === 0) return null;
  return (
    // Under a card: 61px above and 41px below. After the card was answered they sit where a sent message sits.
    <div className={atEnd ? '' : 'mt-[61px] mb-[41px]'} data-transcript-held>
      {heldMessages.map((message, index) => (
        <div key={message.id} className={`flex flex-col items-end gap-1.5 pt-2 px-4 ${atEnd ? 'pb-[35.5px]' : 'pb-[24px]'}`} data-transcript-held-message>
          <div className={USER_BUBBLE_CLASS}>
            <div className="text-text-primary/80 text-[1rem] leading-[1.5] whitespace-pre-wrap break-words">{message.content}</div>
          </div>
          {/* Only the first one is offered, the one that goes next. */}
          {index === 0 && (
            <button
              type="button"
              data-testid="held-message-send-now"
              onClick={() => sendHeldMessage(message.id)}
              className="mt-[10px] ps-1 pe-[10.5px] text-[0.9231rem] text-[var(--tr-muted)] hover:text-text-primary"
            >
              {t('chatPage.sendHeldNow')}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
