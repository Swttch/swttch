import type { WorkflowTask } from '@/shared';
import { useTaskOutputFileLookup } from '@/hooks/useResolvedTaskOutputFile';
import { ModalTitleBar } from './ModalTitleBar';
import { TaskSummaryHeader } from './TaskSummaryHeader';
import { BackgroundTaskOutputBody } from './BackgroundTaskOutputBody';
import { TaskStatusWithStop, TaskStopAction } from './TaskStatusBadge';
import { RunViewActions, type RunPlacement, type RunSurface, type RunVariant } from './RunViewControls';

interface Props {
  task: WorkflowTask;
  /** Omitted where the view is not a window and has nothing to close. */
  onClose?: () => void;
  /** Where this view is drawn: its title row follows it. The window (the default) has nothing to go back to. */
  surface?: RunSurface;
  /** When given, a back chevron sits before the title; the side panel goes back to its task list with it. */
  onBack?: () => void;
  backLabel?: string;
  /** How much of the run is shown: the short one says how it is doing beside the title, the full one has the strip. */
  variant?: RunVariant;
  onVariantChange?: (variant: RunVariant) => void;
  onOpenInNewTab?: () => void;
  /** Where this view is shown now, and what picking another place does. The title row has the menu when given. */
  placement?: RunPlacement;
  onPlacementChange?: (placement: RunPlacement) => void;
}

/**
 * The run view of a plain background Bash task (task_type 'local_bash'). It
 * has no agents array, so its detail comes from the task's own output file: a
 * raw stdout/stderr log (issue #347).
 *
 * Like the agent and workflow views it has a short and a detailed form: the short one drops the strip over the log and
 * says how the task is doing beside the title, with the button that stops it.
 */
export function BashRunView(props: Props) {
  const { task, onClose, surface = 'modal', onBack, backLabel, variant = 'full', onVariantChange, onOpenInNewTab, placement, onPlacementChange } = props;
  const isSimple = variant === 'simple';
  const { path: resolvedOutputFile } = useTaskOutputFileLookup(task);

  return (
    <>
      <ModalTitleBar
        task={task}
        onClose={onClose}
        surface={surface}
        onBack={onBack}
        backLabel={backLabel}
        // In the panel the stop button leaves the title for the left end of the buttons on the right.
        afterTitle={(level) => (isSimple ? <TaskStatusWithStop task={task} hideStop={level > 0} /> : undefined)}
        actions={(level) => (
          <>
            {level > 0 && isSimple && <TaskStopAction task={task} />}
            <RunViewActions
              level={level}
              variant={variant}
              onVariantChange={onVariantChange}
              onOpenInNewTab={onOpenInNewTab}
              placement={placement}
              onPlacementChange={onPlacementChange}
            />
          </>
        )}
      />
      {!isSimple && <TaskSummaryHeader task={task} />}
      <BackgroundTaskOutputBody task={task} outputFile={resolvedOutputFile} />
    </>
  );
}
