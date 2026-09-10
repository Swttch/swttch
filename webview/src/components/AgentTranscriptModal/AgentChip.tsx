import type { WorkflowAgent, WorkflowStatus } from '@/shared';
import { Tooltip } from '@/components/Tooltip';
import {
  agentDisplayName,
  agentDisplayStatus,
  agentDotClass,
  formatDuration,
  formatTokens,
} from '@/utils/workflowFormat';

interface Props {
  /** The CLI's own `workflow_progress[]` entry, whole (see WorkflowAgent). */
  agent: WorkflowAgent;
  /** The workflow's status, which settles agents that never reported finishing. */
  taskStatus: WorkflowStatus;
  /** Phase this chip sits under; its name is dropped from the agent's label. */
  phaseTitle: string | undefined;
  agentId: string;
  selected: boolean;
  onSelect: (agentId: string) => void;
}

/**
 * One agent in the transcript modal's picker.
 *
 * It renders straight from the CLI's entry — `label`, `state`, `tokens`,
 * `durationMs`, `promptPreview` — so anything the CLI reports can be surfaced
 * here without touching the transport (issue #425 follow-up).
 */
export function AgentChip(props: Props) {
  const { agent, taskStatus, phaseTitle, agentId, selected, onSelect } = props;
  const status = agentDisplayStatus(agent.state, taskStatus);
  const tokens = formatTokens(agent.tokens);
  const duration = formatDuration(agent.durationMs);
  const stats = [tokens, duration].filter(Boolean).join(' · ');

  return (
    // `top`, not `right`: horizontal room is what this picker is short of in
    // both its shapes (a narrow sidebar, or a row scrolled to its far end), so
    // a side placement is the one with nowhere to flip to. Vertically there is
    // always the other side of the chip.
    <Tooltip content={agent.promptPreview} placement="top">
      <button
        onClick={() => {
          // Deliberately kept in production. This is the CLI's own per-agent
          // entry, whole, at the far end of the chain — the cheapest way for
          // anyone debugging a workflow to see exactly what the CLI reported
          // about an agent, including fields no part of the UI renders yet.
          console.log('[workflow agent]', agent);
          onSelect(agentId);
        }}
        className={`flex shrink-0 items-center gap-1.5 px-2.5 py-1 rounded-md text-sm transition-colors max-w-64 sm:w-full sm:max-w-none sm:items-start ${
          selected
            ? 'bg-surface-hover text-text-primary'
            : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
        }`}
      >
        <AgentStatusDot status={status} />
        {/* In a row the chip is one line and the stats follow the name. As a
            sidebar the column is too narrow for both, and the name is what the
            reader is scanning for, so the stats drop to a second line instead
            of truncating it. */}
        <span className="flex min-w-0 flex-1 items-center gap-1.5 sm:flex-col sm:items-start sm:gap-0">
          <span className="max-w-full truncate">{agentDisplayName(agent, phaseTitle)}</span>
          {stats && <span className="shrink-0 text-xs text-text-tertiary tabular-nums">{stats}</span>}
        </span>
      </button>
    </Tooltip>
  );
}

/**
 * Progress dot. A running agent also gets a ring spinning around the dot: the
 * dot alone only distinguishes running from finished by colour, which says
 * nothing about whether anything is still happening. Both shapes occupy the
 * same 12px box so a chip does not shift sideways the moment its agent finishes.
 */
function AgentStatusDot(props: { status: 'running' | 'done' | 'stopped' }) {
  const { status } = props;
  if (status !== 'running') {
    return (
      <span className="inline-flex w-3 h-3 shrink-0 items-center justify-center sm:mt-1">
        <span className={`inline-block w-1.5 h-1.5 rounded-full ${agentDotClass(status)}`} />
      </span>
    );
  }
  return (
    <span className="relative inline-flex w-3 h-3 shrink-0 items-center justify-center text-text-link sm:mt-1">
      <span className="absolute inset-0 rounded-full border border-current border-e-transparent border-b-transparent animate-spin" />
      <span className="inline-block w-1.5 h-1.5 rounded-full bg-current" />
    </span>
  );
}
