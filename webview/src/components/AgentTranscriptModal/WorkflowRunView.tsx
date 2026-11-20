import { useCallback, useEffect, useState } from 'react';
import type { WorkflowTask } from '@/shared';
import { useBackgroundTaskActions } from '@/hooks/useBackgroundTaskActions';
import { useSessionContext } from '@/contexts/SessionContext';
import { useUnreachableAgents } from '@/hooks/useUnreachableAgents';
import { agentDisplayStatus } from '@/utils/workflowFormat';
import { ModalTitleBar } from './ModalTitleBar';
import { TaskSummaryHeader } from './TaskSummaryHeader';
import { AgentTabList } from './AgentTabList';
import { DetailHeader } from './AgentDetailHeader';
import { AgentComposer } from './AgentComposer';
import { AgentTranscriptBody } from './AgentTranscriptBody';

interface Props {
  task: WorkflowTask;
  onClose: () => void;
}

/**
 * The run view of a workflow: shows what each of its agents actually did —
 * prompts, replies, tool calls — reusing the same message renderers the main
 * chat uses (issue #347). `task` is passed down live from WorkflowStateContext
 * by the parent, so agent tabs/stats update in place as the workflow
 * progresses (see AgentTranscriptBody for the transcript body's own
 * live-refetch trigger).
 */
export function WorkflowRunView(props: Props) {
  const { task, onClose } = props;
  const [selectedAgentId, setSelectedAgentId] = useState<string | undefined>(task.agents[0]?.agentId);
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

  // Keep a valid selection if the agent list changes (e.g. more agents appear
  // as a running workflow progresses) and nothing was selected yet.
  useEffect(() => {
    if (selectedAgentId === undefined && task.agents.length > 0) {
      setSelectedAgentId(task.agents[0].agentId);
    }
  }, [selectedAgentId, task.agents]);

  const selectedAgent = task.agents.find((a) => a.agentId === selectedAgentId);

  return (
    <>
      <ModalTitleBar task={task} onClose={onClose} />
      <TaskSummaryHeader task={task} />
      {/* Picker beside the transcript rather than above it (issue #425).
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
          at its `min-w`. */}
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
          {selectedAgent && <DetailHeader source={selectedAgent} transcriptDir={task.transcriptDir} />}
          {/* Keyed by agent so each agent gets its own scroll state:
              without it, picking another agent kept the previous
              one's position and following state. */}
          <AgentTranscriptBody
            key={selectedAgent?.agentId}
            transcriptDir={task.transcriptDir}
            agent={selectedAgent}
            taskStatus={task.status}
            sendCount={sendCount}
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
              onSend={sendAndFollow}
              // Stops this agent by its own id, not the workflow it
              // belongs to: resuming one starts it again as a task
              // under that id, which is what there is to stop.
              onStop={() => stopAgent(selectedAgent.agentId!, selectedAgent.label ?? selectedAgent.agentId!)}
              unreachable={unreachableAgents.has(selectedAgent.agentId)}
            />
          )}
        </div>
      </div>
    </>
  );
}
