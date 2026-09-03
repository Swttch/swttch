import { useQuery } from '@tanstack/react-query';
import { useBridge } from './useBridge';
import { useWorkingDirOrNull } from '@/contexts/WorkingDirContext';
import { MessageType } from '@/shared';
import type { WorkflowTask } from '@/shared';

/**
 * A backgrounded Agent/Task's `outputFile` normally arrives on the immediate
 * tool_result right after launch (`onImmediateResult` in workflow-tracker.ts,
 * parsing "output_file: <path>" out of the "Async agent launched" text). But
 * when an already-running agent is *resumed* (via SendMessage), the CLI fires
 * a fresh `task_started` with a new tool_use_id — a brand new WorkflowTask
 * with no memory of the original launch's outputFile, and no "Async agent
 * launched" text of its own for `onImmediateResult` to parse (issue #383).
 * That left such a task's `outputFile` — and with it, the whole live-watch
 * subscription — unavailable until the terminal `task_notification` finally
 * supplies it, so the detail modal showed nothing for the task's entire
 * active run.
 *
 * The output path is otherwise fully determined by `taskId` alone (it is
 * always `<runtime dir>/tasks/<taskId>.output`), so this resolves it the same
 * way `findBackgroundTaskOutputPath` already does for the (previously unused)
 * `FIND_BG_TASK_OUTPUT_PATH` RPC — falling back to it only when the live
 * event stream has not supplied `outputFile` yet.
 */
export function useResolvedTaskOutputFile(task: WorkflowTask): string | undefined {
  const { send } = useBridge();
  const { workingDirectory } = useWorkingDirOrNull() ?? { workingDirectory: null };
  const taskId = task.outputFile ? undefined : task.taskId;

  const { data } = useQuery({
    queryKey: ['bg-task-output-path', taskId, workingDirectory],
    queryFn: async (): Promise<string | null> => {
      const res = await send<{ path: string | null }>(MessageType.FIND_BG_TASK_OUTPUT_PATH, {
        taskId,
        workingDir: workingDirectory,
      });
      return res.path;
    },
    enabled: !!taskId && !!workingDirectory,
    // The runtime directory may not exist yet in the first instant after
    // launch — keep checking while running and still unresolved, same cadence
    // as the transcript refetch below it.
    refetchInterval: task.status === 'running' ? 2000 : false,
    staleTime: 2000,
  });

  return task.outputFile ?? data ?? undefined;
}
