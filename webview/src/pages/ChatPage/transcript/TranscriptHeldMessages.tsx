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
    // (Measured on the desktop app's own screen: 57px from the call's line to the first bubble, 23px from "Send now" to
    // the next bubble, 35px from the last bubble to the working line under them.)
    <div className={atEnd ? 'mt-[2.0187rem]' : 'mt-[3.8125rem] mb-[2.5625rem]'} data-transcript-held>
      {heldMessages.map((message, index) => (
        <div
          key={message.id}
          className={`flex flex-col items-end gap-1.5 pt-2 px-4 ${atEnd ? (index === 0 && heldMessages.length > 1 ? 'pb-[1.5rem]' : 'pb-[1.5875rem]') : 'pb-[1.5rem]'}`}
          data-transcript-held-message
        >
          <div className={USER_BUBBLE_CLASS}>
            <div className="text-text-primary/80 text-[1rem] leading-[1.5] whitespace-pre-wrap break-words">{message.content}</div>
          </div>
          {/* Only the first one is offered, the one that goes next. */}
          {index === 0 && (
            <button
              type="button"
              data-testid="held-message-send-now"
              onClick={() => sendHeldMessage(message.id)}
              className="mt-[0.5437rem] ps-1 pe-[0.6562rem] text-[0.9231rem] text-[var(--tr-muted)] hover:text-text-primary"
            >
              {t('chatPage.sendHeldNow')}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
