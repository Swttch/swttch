import { useCallback, useState } from 'react';
import type { WorkflowTask } from '@/shared';
import { useBackgroundTaskActions } from '@/hooks/useBackgroundTaskActions';
import { useSessionContext } from '@/contexts/SessionContext';
import { useTaskOutputFileLookup } from '@/hooks/useResolvedTaskOutputFile';
import { agentAddressOf } from '@/hooks/useSendToAgent';
import { useUnreachableAgents } from '@/hooks/useUnreachableAgents';
import { useTranscriptViewMode } from '@/pages/ChatPage/message-renderers/transcriptViewMode';
import { ModalTitleBar } from './ModalTitleBar';
import { TaskSummaryHeader } from './TaskSummaryHeader';
import { TaskStatusWithStop, TaskStopAction } from './TaskStatusBadge';
import { DetailHeader } from './AgentDetailHeader';
import { AgentComposer } from './AgentComposer';
import { AgentOutputTranscriptBody } from './AgentOutputTranscriptBody';
import {
  RunViewActions,
  type RunPlacement,
  isCompactSurface,
  type RunSurface,
  type RunVariant,
} from './RunViewControls';

interface Props {
  task: WorkflowTask;
  /** Omitted where the view is not a window and has nothing to close. */
  onClose?: () => void;
  /**
   * When given, a back chevron sits before the title. A window passes nothing;
   * a page goes back to the main session, and the side panel back to its task
   * list. `backLabel` says which, as the chevron's tooltip.
   */
  onBack?: () => void;
  backLabel?: string;
  /**
   * `simple` keeps what the task is, how it is doing, the conversation and the
   * composer (so sending and stopping stay), and drops the rest of the summary
   * and the prompt/result header. Whoever mounts this decides which; it is not
   * something the view works out from where it sits.
   */
  variant?: RunVariant;
  /** When given, the title row offers the word button that switches between the two. */
  onVariantChange?: (variant: RunVariant) => void;
  /** Where this view is drawn: its title row follows it, and the panel's body is tighter all the way down. */
  surface?: RunSurface;
  /** When given, the title row has a button that opens this run in a tab of its own. */
  onOpenInNewTab?: () => void;
  /**
   * Where this view is shown now. When given, the title row has the button that
   * picks another place; `onPlacementChange` is what a pick calls.
   */
  placement?: RunPlacement;
  onPlacementChange?: (placement: RunPlacement) => void;
}

/**
 * The run view of one backgrounded Agent/Task call (task_type 'local_agent').
 *
 * A single agent, not a workflow of many, so its detail comes from the task's
 * own output file: its JSONL transcript, parsed and rendered as chat bubbles
 * like a workflow agent's (issue #383) rather than dumped as raw text.
 *
 * Same two-part shape as the workflow view: what it was asked and what it
 * returned on top, the transcript below. There is no picker because there is
 * one agent.
 */
export function SubagentRunView(props: Props) {
  const { task, onClose, onBack, backLabel, variant = 'full', onVariantChange, surface = 'modal', onOpenInNewTab, placement, onPlacementChange } = props;
  const isSimple = variant === 'simple';
  const compact = isCompactSurface(surface);
  // In the Transcript view the prompt is the first bubble of the conversation and the answer is its last message,
  // so the strip that says both again above it is left out, as the desktop app's agent panel has none.
  const inTranscriptView = useTranscriptViewMode() !== null;
  const isRunning = task.status === 'running';
  const { sendToAgent, stopAgent } = useBackgroundTaskActions();
  // Counts the messages sent from this view, so the transcript above the
  // composer can start following again the moment one goes out, the way the
  // main chat does when you send. See agentRearmKey.
  const [sendCount, setSendCount] = useState(0);
  const sendAndFollow = useCallback(
    (agentId: string, message: string) => {
      sendToAgent(agentId, message);
      setSendCount((n) => n + 1);
    },
    [sendToAgent],
  );
  const { inputMode } = useSessionContext();
  const unreachableAgents = useUnreachableAgents();
  const { path: resolvedOutputFile, unavailable: outputUnavailable } = useTaskOutputFileLookup(task);
  // An agent can be spoken to for as long as it exists — a finished one is
  // resumed by the message, which is how the CLI itself describes it.
  const agentAddress = agentAddressOf(task);
  // Not every agent can be: one that was stopped is not resumed by a message, and the CLI answers one with "was
  // stopped and not resumed". So for a stopped agent, one that a send has already found unreachable, or a record with no
  // address to send to, the composer's place is covered by the bar that says so, rather than left there to fail.
  const canMessage = !!agentAddress && task.status !== 'stopped' && !unreachableAgents.has(agentAddress);

  return (
    <>
      <ModalTitleBar
        task={task}
        onClose={onClose}
        surface={surface}
        onTitleClick={() => console.log(task)}
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
      {/* The simple view says how the task is doing beside the title, and
          has no strip under it. */}
      {!isSimple && <TaskSummaryHeader task={task} />}
      <div className="flex flex-1 min-h-0 flex-col">
        {!isSimple && !inTranscriptView && <DetailHeader source={task} />}
        <AgentOutputTranscriptBody compact={compact} task={task} outputFile={resolvedOutputFile} unavailable={outputUnavailable} sendCount={sendCount} />
        <AgentComposer
            agentId={agentAddress ?? ''}
            unreachable={!canMessage}
            isRunning={isRunning}
            inputMode={inputMode}
            onSend={sendAndFollow}
            // A backgrounded Agent IS its task, so stopping it by its
            // own address stops this agent and nothing else.
            onStop={() => agentAddress && stopAgent(agentAddress, task.name)}
          />
      </div>
    </>
  );
}
