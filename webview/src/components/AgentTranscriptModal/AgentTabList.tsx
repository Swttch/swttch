import type { WorkflowAgent } from '@/shared';
import { agentDotClass } from '@/utils/workflowFormat';

interface Props {
  agents: WorkflowAgent[];
  selectedAgentId: string | undefined;
  onSelect: (agentId: string) => void;
}

export function AgentTabList(props: Props) {
  const { agents, selectedAgentId, onSelect } = props;

  return (
    <div className="flex flex-wrap gap-1 px-4 pt-3 pb-2 border-b border-border-subtle flex-shrink-0">
      {agents.map((agent) => {
        const active = agent.agentId === selectedAgentId;
        return (
          <button
            key={agent.agentId}
            onClick={() => onSelect(agent.agentId)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[0.8461rem] transition-colors max-w-[10rem] ${
              active
                ? 'bg-surface-hover text-text-primary'
                : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
            }`}
            title={agent.label}
          >
            <span className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${agentDotClass(agent.status)}`} />
            <span className="truncate">{agent.label}</span>
          </button>
        );
      })}
    </div>
  );
}
