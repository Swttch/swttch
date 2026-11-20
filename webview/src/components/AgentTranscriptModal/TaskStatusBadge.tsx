import { useTranslation } from '@/i18n';
import type { WorkflowTask } from '@/shared';
import { Tooltip } from '@/components/Tooltip';
import { useNow } from '@/hooks/useNow';
import { WORKFLOW_STATUS_COLOR } from '@/utils/workflowFormat';
import { taskDurationMs, useDurationLabel } from '@/pages/ChatPage/BackgroundTasksPanel/WorkflowTaskSummary';
import { StopButton } from '@/pages/ChatPage/BackgroundTasksPanel/StopButton';
import { useBackgroundTaskActions } from '@/hooks/useBackgroundTaskActions';

const STATUS_LABEL_KEY = {
  running: 'backgroundTasks.statusRunning',
  completed: 'backgroundTasks.statusCompleted',
  failed: 'backgroundTasks.statusFailed',
  stopped: 'backgroundTasks.statusStopped',
} as const;

/**
 * How a task is doing, in the least room: a coloured dot and how long it has
 * run. Meant to sit beside a title.
 *
 * The dot says it by colour, and its name is one hover away (a Tippy tooltip,
 * not a `title`, which the JCEF WebView does not draw): the colours are the
 * ones the summary strip uses for the same four states, and a running task's
 * dot pulses.
 */
export function TaskStatusBadge(props: { task: WorkflowTask }) {
  const { task } = props;
  const { t } = useTranslation('chat');
  const isRunning = task.status === 'running';
  const now = useNow(isRunning);
  const durationLabel = useDurationLabel();
  const duration = durationLabel(taskDurationMs(task, now));
  const label = t(STATUS_LABEL_KEY[task.status] ?? STATUS_LABEL_KEY.stopped);

  return (
    <span className="flex shrink-0 items-center gap-1 text-xs text-text-tertiary">
      <Tooltip content={label} placement="top">
        {/* The padding makes the hit area bigger than the 8px dot. */}
        <span
          role="img"
          aria-label={label}
          className={`flex p-1 ${WORKFLOW_STATUS_COLOR[task.status] || 'text-text-primary/60'}`}
        >
          <span className={`inline-block h-2 w-2 rounded-full bg-current ${isRunning ? 'animate-pulse' : ''}`} />
        </span>
      </Tooltip>
      {duration && <span className="tabular-nums">{duration}</span>}
    </span>
  );
}

/**
 * The badge beside a window's title and, while the task runs, the button that stops it just after the time: the short
 * view has no strip with a cancel button, so the stop is where the running is shown.
 */
export function TaskStatusWithStop(props: { task: WorkflowTask }) {
  const { task } = props;
  const { cancelTask } = useBackgroundTaskActions();
  return (
    <>
      <TaskStatusBadge task={task} />
      {task.status === 'running' && <StopButton task={task} onCancel={cancelTask} />}
    </>
  );
}
