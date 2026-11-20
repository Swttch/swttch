import { useTranslation } from '@/i18n';
import type { WorkflowTask } from '@/shared';
import { Tooltip } from '@/components/Tooltip';
import { useNow } from '@/hooks/useNow';
import { WORKFLOW_STATUS_COLOR } from '@/utils/workflowFormat';
import { taskDurationText } from '@/pages/ChatPage/BackgroundTasksPanel/WorkflowTaskSummary';

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
  const duration = taskDurationText(task, now);
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
