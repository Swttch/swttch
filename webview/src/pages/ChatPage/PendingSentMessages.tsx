import { useChatStreamContext } from '@/contexts/ChatStreamContext';
import { USER_BUBBLE_CLASS } from './transcript/userBubble';

/**
 * The messages sent while a turn is running, drawn after what that turn has written until it ends and they enter the
 * chat (see ChatStreamContext.sentWhileRunning). The CLI answers them after the turn, so they belong below it.
 */
export function PendingSentMessages() {
  const { sentWhileRunning = [] } = useChatStreamContext();
  if (sentWhileRunning.length === 0) return null;
  return (
    <>
      {sentWhileRunning.map((sent) => (
        <div key={sent.id} className="flex flex-col items-end gap-1.5 pt-2 pb-[1.5rem] px-4" data-pending-sent-message>
          <div className={USER_BUBBLE_CLASS}>
            <div className="text-text-primary/80 text-[1rem] leading-[1.5] whitespace-pre-wrap break-words">{sent.content}</div>
          </div>
        </div>
      ))}
    </>
  );
}
