import { useChatStreamContext } from '@/contexts/ChatStreamContext';

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
        <div key={sent.id} className="flex flex-col items-end gap-1.5 pt-2 pb-[24px] px-4" data-pending-sent-message>
          <div className="max-w-[37rem] min-w-0 rounded-2xl bg-surface-hover px-3.5 py-2">
            <div className="text-text-primary/80 text-[1rem] leading-[1.5] whitespace-pre-wrap break-words">{sent.content}</div>
          </div>
        </div>
      ))}
    </>
  );
}
