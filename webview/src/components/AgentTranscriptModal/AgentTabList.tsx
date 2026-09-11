import type { WorkflowAgent, WorkflowStatus } from '@/shared';
import { useTranslation } from '@/i18n';
import { AgentChip } from './AgentChip';

interface Props {
  agents: WorkflowAgent[];
  taskStatus: WorkflowStatus;
  selectedAgentId: string | undefined;
  onSelect: (agentId: string) => void;
}

/**
 * Agent picker for the transcript modal, grouped by the phase each agent runs
 * in. It takes two shapes (issue #425):
 *
 * - From `sm` up it is a sidebar column beside the transcript, scrolling
 *   vertically. It is the one holding `flex-1` here, so it is the column that
 *   takes whatever width the transcript did not claim; narrow the modal and
 *   the sidebar is what shrinks, down to its `min-w`. `max-w` keeps it from
 *   swallowing a wide modal.
 * - Below `sm` there is no room for two columns, so it goes back above the
 *   transcript: one row per phase, each row scrolling its own agents sideways
 *   while the phase's name stays put beside them. The phase name is outside
 *   that scroller, so it stays readable however far the agents are scrolled.
 *
 * Stacked, the whole thing is capped and scrolls vertically. Without that cap a
 * workflow with many phases would grow the picker until the transcript had
 * nothing left — the very bug this modal was rebuilt to fix.
 */
export function AgentTabList(props: Props) {
  const { agents, taskStatus, selectedAgentId, onSelect } = props;
  const { t } = useTranslation('chat');
  const groups = groupByPhase(agents);
  const hasPhases = groups.some((g) => g.title);

  return (
    <div className="flex shrink-0 flex-col gap-1 max-h-32 overflow-y-auto px-4 pt-3 pb-2 border-b border-border-subtle sm:flex-1 sm:max-h-none sm:max-w-52 sm:min-w-28 sm:pb-3 sm:border-b-0 sm:border-e">
      {hasPhases && (
        <div className="shrink-0 text-xs uppercase tracking-wide text-text-tertiary">
          {t('backgroundTasks.phasesLabel')}
        </div>
      )}
      {groups.map((group) => (
        <div key={group.title ?? '(none)'} className="flex shrink-0 items-center gap-1 sm:block">
          {group.title && (
            <div className="flex w-20 shrink-0 items-center justify-between gap-1.5 text-sm text-text-tertiary sm:w-full sm:px-1 sm:pt-1 sm:pb-0.5">
              <span className="truncate">{group.title}</span>
              <span className="shrink-0 tabular-nums">{group.agents.length}</span>
            </div>
          )}
          {/* Only the agents scroll sideways; their phase's name is a sibling of
              this scroller, not inside it. From `sm` the same list stacks. */}
          <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto sm:flex-col sm:overflow-x-visible">
            {group.agents.map((agent, i) => {
              const agentId = agent.agentId ?? String(agent.index ?? i);
              return (
                <AgentChip
                  key={agentId}
                  agent={agent}
                  agentId={agentId}
                  taskStatus={taskStatus}
                  phaseTitle={group.title}
                  selected={agentId === selectedAgentId}
                  onSelect={onSelect}
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

interface PhaseGroup {
  title: string | undefined;
  agents: WorkflowAgent[];
}

/**
 * Split the agents into their phases, keeping the order the CLI sent them in
 * (the backend already orders by the agent's global `index`). Agents whose
 * entry carries no `phaseTitle` — every agent of a workflow rebuilt from disk,
 * since the CLI persists no phase — fall into one untitled group, which renders
 * without a header rather than under a made-up one.
 */
function groupByPhase(agents: WorkflowAgent[]): PhaseGroup[] {
  const groups: PhaseGroup[] = [];
  for (const agent of agents) {
    const title = typeof agent.phaseTitle === 'string' && agent.phaseTitle ? agent.phaseTitle : undefined;
    const last = groups[groups.length - 1];
    if (last && last.title === title) last.agents.push(agent);
    else groups.push({ title, agents: [agent] });
  }
  return groups;
}
