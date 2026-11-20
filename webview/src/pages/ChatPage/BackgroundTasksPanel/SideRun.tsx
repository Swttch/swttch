import type { WorkflowTask } from '@/shared';
import { SubagentRunView } from '@/components/AgentTranscriptModal/SubagentRunView';
import { WorkflowRunView } from '@/components/AgentTranscriptModal/WorkflowRunView';
import { BashRunView } from '@/components/AgentTranscriptModal/BashRunView';
import type { RunPlacement, RunVariant } from '@/components/AgentTranscriptModal/RunViewControls';

/**
 * The run of one task drawn in the side panel, by what the task is: a single agent, a plain background command, or a
 * workflow of several agents (the kinds the window tells apart as well). All three use the one title row, in its panel
 * form, with a way back to the task list; the panel is the "side" placement among the ones a run can open in.
 */
export function SideRun(props: {
  task: WorkflowTask;
  variant: RunVariant;
  onVariantChange: (variant: RunVariant) => void;
  onBack: () => void;
  backLabel: string;
  onClose: () => void;
  onPlacementChange: (placement: RunPlacement) => void;
}) {
  const { task, variant, onVariantChange, onBack, backLabel, onClose, onPlacementChange } = props;
  const common = { surface: 'panel' as const, onBack, backLabel, onClose, placement: 'side' as const, onPlacementChange };
  // Opening in a tab comes with the page of its own (#667, a later step): drawn, not wired yet.
  const onOpenInNewTab = () => {};
  switch (task.taskType) {
    case 'local_agent':
      return <SubagentRunView task={task} variant={variant} onVariantChange={onVariantChange} onOpenInNewTab={onOpenInNewTab} {...common} />;
    case 'local_bash':
      return <BashRunView task={task} variant={variant} onVariantChange={onVariantChange} onOpenInNewTab={onOpenInNewTab} {...common} />;
    default:
      return <WorkflowRunView task={task} variant={variant} onVariantChange={onVariantChange} onOpenInNewTab={onOpenInNewTab} {...common} />;
  }
}
