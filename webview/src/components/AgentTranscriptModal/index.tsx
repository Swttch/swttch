import { useEffect, useRef, useState } from 'react';
import { useTranslation } from '@/i18n';
import { Portal } from '@/components/Portal';
import type { WorkflowTask } from '@/shared';
import { useVerticalResize } from '@/hooks/useVerticalResize';
import { SubagentRunView } from './SubagentRunView';
import type { RunVariant } from './RunViewControls';
import { WorkflowRunView } from './WorkflowRunView';
import { BashRunView } from './BashRunView';

interface Props {
  task: WorkflowTask;
  onClose: () => void;
}

// The modal's height is `calc(60vh + <offset>px)` — the 60vh keeps it
// scaling with the window, and the offset is the only part the resize handle
// drags. useVerticalResize only knows how to drag a plain px number, so it
// manages the offset alone; the 60vh is spliced back in at render time.
const DEFAULT_HEIGHT_OFFSET_PX = 180;
const MIN_HEIGHT_OFFSET_PX = -84;
// Must stay above DEFAULT_HEIGHT_OFFSET_PX so the drag handle can still grow
// the modal from its default — leaves 300px of headroom to drag into.
const MAX_HEIGHT_OFFSET_PX = DEFAULT_HEIGHT_OFFSET_PX + 300;

/**
 * The window a Background tasks panel row opens (issue #347).
 *
 * This is only the window: the scrim, the size and its resize handle, the
 * focus trap and Escape. It draws nothing of what is inside. What a task shows
 * depends on what kind of task it is, so each kind has a run view of its own
 * (SubagentRunView, WorkflowRunView, BashRunView), and the parts they share
 * (the title row, the summary strip) are components they each take.
 */
export function AgentTranscriptModal(props: Props) {
  const { task, onClose } = props;
  const { t } = useTranslation('chat');
  const dialogRef = useRef<HTMLDivElement>(null);
  const { height: heightOffset, startResize, wasJustResizing } = useVerticalResize({
    initialHeight: DEFAULT_HEIGHT_OFFSET_PX,
    minHeight: MIN_HEIGHT_OFFSET_PX,
    maxHeight: MAX_HEIGHT_OFFSET_PX,
  });

  // Focus trap, mirroring McpModal: without it, clicking inside this modal
  // yanks focus back to the chat composer's auto-focus timers.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();

    const handleFocusIn = (e: FocusEvent) => {
      const dialog = dialogRef.current;
      if (dialog && e.target instanceof Node && !dialog.contains(e.target)) {
        dialog.focus();
      }
    };
    document.addEventListener('focusin', handleFocusIn);

    return () => {
      document.removeEventListener('focusin', handleFocusIn);
      if (previouslyFocused?.isConnected) {
        previouslyFocused.focus();
      }
    };
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <Portal>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-overlay-scrim"
        onClick={(e) => {
          // A resize drag that ends off the thin handle lands on this overlay
          // and looks identical to a real outside-click — skip the very next
          // one so finishing a resize doesn't close the modal it just resized.
          if (wasJustResizing()) return;
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className="relative w-full max-w-3xl" style={{ height: `calc(60vh + ${heightOffset}px)` }}>
          <div
            ref={dialogRef}
            tabIndex={-1}
            className="h-full bg-surface-raised border border-border-default rounded-xl shadow-2xl overflow-hidden flex flex-col focus:outline-none"
          >
            <RunView task={task} onClose={onClose} />
          </div>

          {/* Drag-to-resize handle. A thin hit target with a wider invisible
              padding, mirroring how resizable panels are usually grabbed —
              the visible bar alone would be too thin to grab reliably. */}
          <div
            onPointerDown={startResize}
            className="absolute left-0 right-0 -bottom-1.5 h-3 cursor-ns-resize group flex items-center justify-center"
            title={t('backgroundTasks.transcriptModal.resize')}
          >
            <div className="w-10 h-1 rounded-full bg-border-default group-hover:bg-text-tertiary transition-colors" />
          </div>
        </div>
      </div>
    </Portal>
  );
}

/**
 * Which view a task gets. A plain background Bash task (`local_bash`) and a
 * single backgrounded Agent/Task call (`local_agent`) are each one process or
 * agent, not a workflow of many, so neither has an agents array (issue #347,
 * extended for #383); everything else is a workflow.
 */
function RunView(props: Props) {
  const { task, onClose } = props;
  // Which of its two views a subagent shows. The short one at first.
  const [subagentVariant, setSubagentVariant] = useState<RunVariant>('simple');
  // A workflow opens to the short view too, as a subagent does.
  const [workflowVariant, setWorkflowVariant] = useState<RunVariant>('simple');
  switch (task.taskType) {
    case 'local_bash':
      return <BashRunView task={task} onClose={onClose} />;
    case 'local_agent':
      return (
        <SubagentRunView
          task={task}
          onClose={onClose}
          variant={subagentVariant}
          onVariantChange={setSubagentVariant}
          // This window is the "center" placement. Opening in a tab, and moving
          // to the other three placements, are drawn but not wired yet: the
          // pages they go to come in later steps of #667.
          placement="center"
          onOpenInNewTab={() => {}}
        />
      );
    default:
      return (
        <WorkflowRunView
          task={task}
          onClose={onClose}
          variant={workflowVariant}
          onVariantChange={setWorkflowVariant}
          // As for a subagent: this window is the "center" placement, and the others are drawn, not wired yet.
          placement="center"
          onOpenInNewTab={() => {}}
        />
      );
  }
}
