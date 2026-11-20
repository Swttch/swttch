import type { WorkflowTask } from '@/shared';
import { useTaskOutputFileLookup } from '@/hooks/useResolvedTaskOutputFile';
import { ModalTitleBar } from './ModalTitleBar';
import { TaskSummaryHeader } from './TaskSummaryHeader';
import { BackgroundTaskOutputBody } from './BackgroundTaskOutputBody';

interface Props {
  task: WorkflowTask;
  onClose: () => void;
}

/**
 * The run view of a plain background Bash task (task_type 'local_bash'). It
 * has no agents array, so its detail comes from the task's own output file: a
 * raw stdout/stderr log (issue #347).
 */
export function BashRunView(props: Props) {
  const { task, onClose } = props;
  const { path: resolvedOutputFile } = useTaskOutputFileLookup(task);

  return (
    <>
      <ModalTitleBar task={task} onClose={onClose} />
      <TaskSummaryHeader task={task} />
      <BackgroundTaskOutputBody task={task} outputFile={resolvedOutputFile} />
    </>
  );
}
