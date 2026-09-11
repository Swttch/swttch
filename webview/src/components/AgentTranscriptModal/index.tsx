import { useEffect, useRef, useState } from 'react';
import { XMarkIcon, StopCircleIcon } from '@heroicons/react/24/outline';
import { useTranslation } from '@/i18n';
import { Portal } from '@/components/Portal';
import type { WorkflowTask } from '@/shared';
import { useBackgroundTaskActions } from '@/hooks/useBackgroundTaskActions';
import { useSessionContext } from '@/contexts/SessionContext';
import { useNow } from '@/hooks/useNow';
import { useVerticalResize } from '@/hooks/useVerticalResize';
import { useResolvedTaskOutputFile } from '@/hooks/useResolvedTaskOutputFile';
import { agentAddressOf } from '@/hooks/useSendToAgent';
import { agentDisplayStatus } from '@/utils/workflowFormat';
import { WorkflowTaskSummary } from '@/pages/ChatPage/BackgroundTasksPanel/WorkflowTaskSummary';
import { AgentTabList } from './AgentTabList';
import { DetailHeader } from './AgentDetailHeader';
import { AgentComposer } from './AgentComposer';
import { AgentTranscriptBody } from './AgentTranscriptBody';
import { AgentOutputTranscriptBody } from './AgentOutputTranscriptBody';
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
  const { cancelTask, sendToAgent, stopAgent } = useBackgroundTaskActions();
  const { inputMode } = useSessionContext();
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
  // detail comes from the task's own output file instead of a transcript
  // picker (issue #347, extended for #383). Bash's file is a raw stdout/
  // stderr log (BackgroundTaskOutputBody); an Agent's is its own JSONL
  // transcript, parsed and rendered as chat bubbles like a workflow agent's
  // (AgentOutputTranscriptBody) rather than dumped as raw text.
  const isBashTask = task.taskType === 'local_bash';
  const isAgentTask = task.taskType === 'local_agent';
  const resolvedOutputFile = useResolvedTaskOutputFile(task);
  // An agent can be spoken to for as long as it exists — a finished one is
  // resumed by the message, which is how the CLI itself describes it.
  const agentAddress = agentAddressOf(task);

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
            <div className="flex items-center justify-between px-4 pt-4 pb-2 flex-shrink-0">
              {/* Clicking the title logs the task object this modal was built
                  from, so what the CLI actually sends for a single Agent/Task
                  can be read in full. Logged as the object, not a string, so
                  the console can be expanded field by field. */}
              <h2
                className="text-lg font-semibold text-text-primary truncate"
                onClick={isAgentTask ? () => console.log(task) : undefined}
              >
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
                summary card it was opened from.

                Phases are the exception, and only because the picker below now
                carries them: it groups the agents under their phase and counts
                them, which says strictly more than the header's flat list did.
                Listing them in both places just read as the same thing twice. */}
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

            {isBashTask ? (
              <BackgroundTaskOutputBody task={task} outputFile={resolvedOutputFile} />
            ) : isAgentTask ? (
              // Same two-part shape as the workflow view to its right: what it
              // was asked and what it returned on top, the transcript below.
              // There is no picker because there is one agent, not many.
              <div className="flex flex-1 min-h-0 flex-col">
                <DetailHeader source={task} />
                <AgentOutputTranscriptBody task={task} outputFile={resolvedOutputFile} />
                {agentAddress && (
                  <AgentComposer
                    agentId={agentAddress}
                    isRunning={isRunning}
                    inputMode={inputMode}
                    onSend={sendToAgent}
                    // A backgrounded Agent IS its task, so stopping it by its
                    // own address stops this agent and nothing else.
                    onStop={() => stopAgent(agentAddress, task.name)}
                  />
                )}
              </div>
            ) : (
              /* Picker beside the transcript rather than above it (issue #425).
                 Stacked, the two shared one column of height, so a workflow with
                 many agents grew the picker until the transcript was left with
                 ~30px. Side by side, the picker is bounded by the modal's height
                 and the transcript's height no longer depends on how many agents
                 the workflow spawned. Below `sm` the modal is too narrow for two
                 columns, so `flex-col` puts the picker back on top; see
                 AgentTabList for the row-with-sideways-scroll shape it takes
                 there.

                 Which column gives way when the modal narrows is decided by
                 which one holds `flex-1`, because that is the one sized from
                 what is left over. From `sm` up the transcript claims a width
                 of its own (`w-full` capped at `max-w-xl`) and the picker holds
                 `flex-1`, so the picker is what shrinks. `flex-initial` keeps
                 the transcript shrinkable for after the picker has bottomed out
                 at its `min-w`. */
              <div className="flex flex-1 min-h-0 flex-col sm:flex-row">
                {task.agents.length > 0 && (
                  <AgentTabList
                    agents={task.agents}
                    taskStatus={task.status}
                    selectedAgentId={selectedAgentId}
                    onSelect={setSelectedAgentId}
                  />
                )}
                <div className="flex flex-1 min-h-0 min-w-0 flex-col sm:flex-initial sm:w-full sm:max-w-xl">
                  {selectedAgent && (
                    <DetailHeader source={selectedAgent} transcriptDir={task.transcriptDir} />
                  )}
                  <AgentTranscriptBody
                    transcriptDir={task.transcriptDir}
                    agent={selectedAgent}
                    taskStatus={task.status}
                  />
                  {/* The same composer the single-agent view gets. A workflow
                      agent is reachable by its runtime agentId even though the
                      CLI never tells the model that id — we have it from
                      task_progress, so this is a thing only the GUI can offer.

                      No stop button here: stopping would have to stop the whole
                      workflow, which is a different act from stopping the agent
                      you are looking at, and there is no request for the
                      latter. */}
                  {selectedAgent?.agentId && (
                    <AgentComposer
                      agentId={selectedAgent.agentId}
                      // This agent's own state, not the workflow's: one can be
                      // finished while the run around it goes on.
                      isRunning={agentDisplayStatus(selectedAgent.state, task.status) === 'running'}
                      inputMode={inputMode}
                      onSend={sendToAgent}
                      // Stops this agent by its own id, not the workflow it
                      // belongs to: resuming one starts it again as a task
                      // under that id, which is what there is to stop.
                      onStop={() => stopAgent(selectedAgent.agentId!, selectedAgent.label ?? selectedAgent.agentId!)}
                    />
                  )}
                </div>
              </div>
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
