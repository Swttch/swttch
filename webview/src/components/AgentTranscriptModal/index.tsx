import { useEffect, useRef, useState } from 'react';
import { XMarkIcon, StopCircleIcon } from '@heroicons/react/24/outline';
import { useTranslation } from '@/i18n';
import { Portal } from '@/components/Portal';
import type { WorkflowTask } from '@/shared';
import { useBackgroundTaskActions } from '@/hooks/useBackgroundTaskActions';
import { useNow } from '@/hooks/useNow';
import { useVerticalResize } from '@/hooks/useVerticalResize';
import { WorkflowTaskSummary } from '@/pages/ChatPage/BackgroundTasksPanel/WorkflowTaskSummary';
import { AgentTabList } from './AgentTabList';
import { AgentTranscriptBody } from './AgentTranscriptBody';
import { BackgroundTaskOutputBody } from './BackgroundTaskOutputBody';

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
 * Detail modal for a Background tasks panel row (issue #347): shows what each
 * of a workflow's agents actually did — prompts, replies, tool calls — reusing
 * the same message renderers the main chat uses. `task` is passed down live
 * from WorkflowStateContext by the parent, so agent tabs/stats update in place
 * as the workflow progresses (see AgentTranscriptBody for the transcript body's
 * own live-refetch trigger).
 */
export function AgentTranscriptModal(props: Props) {
  const { task, onClose } = props;
  const { t } = useTranslation('chat');
  const [selectedAgentId, setSelectedAgentId] = useState<string | undefined>(task.agents[0]?.agentId);
  const dialogRef = useRef<HTMLDivElement>(null);
  const isRunning = task.status === 'running';
  const now = useNow(isRunning);
  const { cancelTask } = useBackgroundTaskActions();
  const { height: heightOffset, startResize, wasJustResizing } = useVerticalResize({
    initialHeight: DEFAULT_HEIGHT_OFFSET_PX,
    minHeight: MIN_HEIGHT_OFFSET_PX,
    maxHeight: MAX_HEIGHT_OFFSET_PX,
  });

  // Keep a valid selection if the agent list changes (e.g. more agents appear
  // as a running workflow progresses) and nothing was selected yet.
  useEffect(() => {
    if (selectedAgentId === undefined && task.agents.length > 0) {
      setSelectedAgentId(task.agents[0].agentId);
    }
  }, [selectedAgentId, task.agents]);

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

  const selectedAgent = task.agents.find((a) => a.agentId === selectedAgentId);
  // A plain background Bash task (task_type 'local_bash') or a single
  // backgrounded Agent/Task call (task_type 'local_agent') has no agents
  // array — each is one process/agent, not a workflow of many — so its
  // detail is the raw output file instead of a transcript picker (issue
  // #347, extended for #383).
  const hasRawOutputOnly = task.taskType === 'local_bash' || task.taskType === 'local_agent';

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
        <div className="relative w-full max-w-2xl" style={{ height: `calc(60vh + ${heightOffset}px)` }}>
          <div
            ref={dialogRef}
            tabIndex={-1}
            className="h-full bg-surface-raised border border-border-default rounded-xl shadow-2xl overflow-hidden flex flex-col focus:outline-none"
          >
            <div className="flex items-center justify-between px-4 pt-4 pb-2 flex-shrink-0">
              <h2 className="text-lg font-semibold text-text-primary truncate">
                {t('backgroundTasks.transcriptModal.title', { name: task.name })}
              </h2>
              <button
                onClick={onClose}
                className="w-8 h-8 flex items-center justify-center rounded text-gray-400 hover:bg-gray-500/50 transition-colors shrink-0"
                title={t('backgroundTasks.close')}
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            {/* Everything the panel card's summary shows (status, agents/tokens/
                time, description, phases) must also be here — the modal is the
                detail view, so it must never carry less information than the
                summary card it was opened from. */}
            <div className="px-4 pb-3 flex-shrink-0 border-b border-border-subtle">
              <WorkflowTaskSummary task={task} now={now} showPhases={hasRawOutputOnly ? false : true} />
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

            {hasRawOutputOnly ? (
              <BackgroundTaskOutputBody task={task} />
            ) : (
              <>
                {task.agents.length > 0 && (
                  <AgentTabList agents={task.agents} selectedAgentId={selectedAgentId} onSelect={setSelectedAgentId} />
                )}
                <AgentTranscriptBody transcriptDir={task.transcriptDir} agent={selectedAgent} />
              </>
            )}
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
