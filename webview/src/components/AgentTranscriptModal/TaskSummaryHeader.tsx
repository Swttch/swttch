import { StopCircleIcon } from '@heroicons/react/24/outline';
import { useTranslation } from '@/i18n';
import type { WorkflowTask } from '@/shared';
import { useBackgroundTaskActions } from '@/hooks/useBackgroundTaskActions';
import { useNow } from '@/hooks/useNow';
import { WorkflowTaskSummary } from '@/pages/ChatPage/BackgroundTasksPanel/WorkflowTaskSummary';

interface Props {
  task: WorkflowTask;
}

/**
 * Everything the panel card's summary shows (status, agents/tokens/time,
 * description) plus the cancel button, as the strip under the title.
 *
 * The detail view must never carry less information than the summary card it
 * was opened from.
 *
 * Phases are the exception, and only because the workflow's picker now carries
 * them: it groups the agents under their phase and counts them, which says
 * strictly more than the header's flat list did. Listing them in both places
 * just read as the same thing twice.
 */
export function TaskSummaryHeader(props: Props) {
  const { task } = props;
  const { t } = useTranslation('chat');
  const isRunning = task.status === 'running';
  const now = useNow(isRunning);
  const { cancelTask } = useBackgroundTaskActions();

  return (
    <div className="px-4 pb-3 flex-shrink-0 border-b border-border-subtle">
      <WorkflowTaskSummary task={task} now={now} showPhases={false} />
      {isRunning && (
        <button
          onClick={() => cancelTask(task)}
          className="mt-2 flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[0.8461rem] text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors border border-border-subtle"
        >
          <StopCircleIcon className="w-4 h-4" />
          {t('backgroundTasks.cancelRunning')}
        </button>
      )}
    </div>
  );
}
