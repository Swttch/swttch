import { useCallback, useMemo } from 'react';
import { useBridgeContext } from '@/contexts/BridgeContext';
import { useSessionContext } from '@/contexts/SessionContext';
import { useChatStreamContext } from '@/contexts/ChatStreamContext';
import { useWorkflowState } from '@/contexts/WorkflowStateContext';
import { useCancelBackgroundTask } from './useCancelBackgroundTask';
import type { WorkflowTask } from '@/shared';

/**
 * Cancelling background tasks, bound to the current session.
 *
 * One place because two controls reach the same action: the panel's per-row "✕"
 * and the Escape ×3 gesture that stops all of them (issue #330). A shortcut that
 * behaved differently from the button would be the same feature answering to two
 * rules.
 *
 * Nothing here settles a task's card. The cancel is a request; the CLI reports
 * the real outcome on `task_notification`, which flips the status through
 * WORKFLOW_PROGRESS. Painting them stopped up front would lie whenever a cancel
 * does not land.
 */
export function useBackgroundTaskActions() {
  const bridge = useBridgeContext();
  const session = useSessionContext();
  const { sendMessage } = useChatStreamContext();
  const { runningTasks } = useWorkflowState();
  const cancelBackgroundTask = useCancelBackgroundTask(bridge);

  const { currentSessionId, workingDirectory, inputMode } = session;
  const context = useMemo(
    () => ({
      sessionId: currentSessionId ?? undefined,
      workingDir: workingDirectory ?? '',
      inputMode,
      sendMessage,
    }),
    [currentSessionId, workingDirectory, inputMode, sendMessage],
  );

  const cancelTask = useCallback(
    (task: WorkflowTask) => {
      void cancelBackgroundTask(task, context);
    },
    [cancelBackgroundTask, context],
  );

  const cancelAllRunning = useCallback(() => {
    // Fired one per task rather than as a single "stop everything" request:
    // there is no such request, and doing it per task means the fallback route
    // applies to each one on its own terms.
    for (const task of runningTasks) void cancelBackgroundTask(task, context);
  }, [runningTasks, cancelBackgroundTask, context]);

  return { cancelTask, cancelAllRunning, runningCount: runningTasks.length };
}
