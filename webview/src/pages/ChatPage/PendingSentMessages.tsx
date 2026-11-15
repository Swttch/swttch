import { useChatStreamContext } from '@/contexts/ChatStreamContext';
import { MessageBox } from './message-renderers/components/MessageBox';

/**
 * The messages sent while a turn is running, drawn after what that turn has written until it ends and they enter the
 * chat (see ChatStreamContext.sentWhileRunning). The CLI answers them after the turn, so they belong below it.
 *
 * This is the classic chat's: a sent message sits in the same box the classic chat gives every send. The Transcript
 * views draw theirs in `TranscriptPendingMessages`, with the desktop app's bubble and the buttons under it.
 */
export function PendingSentMessages() {
  const { sentWhileRunning = [] } = useChatStreamContext();
  if (sentWhileRunning.length === 0) return null;
  return (
    <>
      {sentWhileRunning.map((sent) => (
        <div key={sent.id} className="group py-2 px-4 space-y-2.5" data-pending-sent-message>
          <div className="flex items-start">
            <div className="relative min-w-0">
              <MessageBox>
                <div className="text-text-primary/80 text-[1rem] leading-[1.5] whitespace-pre-wrap break-words">{sent.content}</div>
              </MessageBox>
            </div>
          </div>
        </div>
      ))}
    </>
  );
}
