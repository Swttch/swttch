import { useTranslation } from '@/i18n';
import type { LoadedMessageDto } from '@/types';
import { useOptionalWorkflowState } from '@/contexts/WorkflowStateContext';
import { useFormatElapsed } from './TranscriptActivity';
import { taskNoticeOf } from './taskNotice';

/**
 * The CLI's notice that a background task is over, as the desktop app draws it where the notice arrived: one quiet
 * line saying what ended ("Background agent completed · final check") and, at its end, how long it took. A task that
 * failed says why; one that stopped says so.
 *
 * Where the app tracks the task the line is a way into it, as in the desktop app: a click opens the background tasks
 * panel with that task in focus.
 */
export function TranscriptTaskNotice({ message }: { message: LoadedMessageDto }) {
  const { t } = useTranslation('chat');
  const formatElapsed = useFormatElapsed();
  const workflow = useOptionalWorkflowState();
  const notice = taskNoticeOf(message);
  if (!notice) return null;

  const noun = t(`transcript.taskNotice.noun.${notice.noun}`);
  // As the desktop app has it, a task that is done says so, and one that failed says so in a sentence of its own,
  // red, with the rest of the line quiet; a stop says what the task was and that it stopped, with no time.
  const failed = notice.status === 'failed';
  const clause = failed
    ? t(`transcript.taskNotice.failed.${notice.noun}`)
    : notice.status === 'completed' && notice.noun === 'command'
      ? t('transcript.taskNotice.commandCompleted')
      : notice.status === 'completed'
      ? t('transcript.taskNotice.label', { noun, status: t('transcript.taskNotice.status.completed') })
      : t('transcript.taskNotice.label', { noun, status: t('transcript.taskNotice.status.stopped') });
  const detail = notice.reason ? `${notice.detail}: ${notice.reason}` : notice.detail;
  const took =
    notice.durationMs === null || notice.status !== 'completed' || notice.noun === 'command'
      ? null
      : t('transcript.taskNotice.took', { elapsed: formatElapsed(Math.max(0, Math.round(notice.durationMs / 1000))) });

  // The call that started the task finds it. A resumed agent's later notices name the call that resumed it instead, so
  // those find it by the agent's own id.
  const task =
    (notice.toolUseId !== null ? workflow?.getByToolUseId(notice.toolUseId) : undefined) ??
    (notice.taskId !== null ? workflow?.tasks.find((candidate) => candidate.taskId === notice.taskId) : undefined);
  const opens = !!workflow && task !== undefined;
  // The space above and below is what the desktop app leaves around it (measured: 40px from one line of text to the next).
  const className = `flex w-full items-baseline px-4 py-[1.1813rem] text-start text-[0.8438rem] leading-[1.2376rem] text-[var(--tr-muted)]${opens ? ' cursor-pointer transition-[filter] hover:brightness-[1.25]' : ''}`;
  const content = (
    <>
      {/* What gives way on a narrow screen is the name, as in the desktop app ("… · f… · 1m 18s took"); the time stays. */}
      <span className="min-w-0 truncate">
        {failed ? <span className="text-state-error-fg">{clause}</span> : clause}
        {detail ? ` · ${detail}` : ''}
      </span>
      {took && <span className="flex-shrink-0 whitespace-pre">{` · ${took}`}</span>}
    </>
  );

  if (opens) {
    return (
      <button
        type="button"
        className={className}
        data-transcript-task-notice={notice.status}
        onClick={() => workflow.openPanel(task.toolUseId)}
      >
        {content}
      </button>
    );
  }
  return (
    <div className={className} data-transcript-task-notice={notice.status}>
      {content}
    </div>
  );
}
