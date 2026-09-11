import type { WorkflowStatus, WorkflowTask, WorkflowUsage } from '@/shared';

function usageNumber(usage: WorkflowUsage | undefined, key: string): number | undefined {
    const value = usage?.[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/**
 * The token total, whichever of its two names the CLI used.
 *
 * A live `task_progress`/`task_notification` event calls it `total_tokens`; the
 * `<task-notification>` envelope that survives in the transcript calls the same
 * figure `subagent_tokens`. Both reach here as sent, so reading one name alone
 * silently shows nothing for tasks that arrived by the other route.
 */
export function workflowTokens(usage?: WorkflowUsage): number | undefined {
    return usageNumber(usage, 'total_tokens') ?? usageNumber(usage, 'subagent_tokens');
}

/** Tool-use count as the CLI reported it. */
export function workflowToolUses(usage?: WorkflowUsage): number | undefined {
    return usageNumber(usage, 'tool_uses');
}

/**
 * Duration as the CLI reported it. Absent for a task that never got a
 * notification (settled from its own output log instead), where the caller
 * falls back to the clock.
 */
export function workflowDurationMs(usage?: WorkflowUsage): number | undefined {
    return usageNumber(usage, 'duration_ms');
}

/** Agent count as the CLI reported it; only the envelope carries one. */
export function workflowAgentCount(usage?: WorkflowUsage): number | undefined {
    return usageNumber(usage, 'agent_count');
}

/** Format a millisecond duration as "Ns" / "Nm" / "Nm Ms". Returns undefined for 0/none. */
export function formatDuration(ms?: number): string | undefined {
    if (!ms || ms <= 0) return undefined;
    const totalSec = Math.round(ms / 1000);
    if (totalSec < 60) return `${totalSec}s`;
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return sec ? `${min}m ${sec}s` : `${min}m`;
}

/** Format a token count as "1.2k" once it crosses 1000. Returns undefined for 0/none. */
export function formatTokens(n?: number): string | undefined {
    if (n === undefined || n <= 0) return undefined;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
    return String(n);
}

/** Tailwind text color for a workflow/agent status. */
export const WORKFLOW_STATUS_COLOR: Record<string, string> = {
    running: 'text-text-link',
    completed: 'text-state-success-fg',
    failed: 'text-state-error-fg',
    stopped: 'text-state-warning-fg',
};

/**
 * Tailwind background for an agent progress dot. `done` is green (succeeded),
 * `stopped` is a muted grey (cut off when the workflow was interrupted — not a
 * success), `running` pulses blue.
 */
export function agentDotClass(status: 'running' | 'done' | 'stopped'): string {
    switch (status) {
        case 'done':
            return 'bg-state-success-fg';
        case 'stopped':
            return 'bg-text-tertiary';
        default:
            return 'bg-text-link animate-pulse';
    }
}

/** CLI `state` values on a workflow agent that mean it finished successfully. */
const AGENT_DONE_STATES = new Set(['done', 'completed', 'success']);

/**
 * The three-way status the UI paints, derived here rather than stored: the CLI
 * sends its own `state` (`start`, `progress`, `error`, `done`, …) and the
 * backend passes it through untouched, so turning it into a dot color is
 * display work and belongs on this side.
 *
 * `stopped` has no CLI equivalent. It is what an agent gets when the workflow
 * itself reached a terminal status while this agent never reported finishing:
 * a completed workflow finished its agents (green), while a stopped or failed
 * one cut them off (grey). Never paint an interrupted agent as a success.
 */
export function agentDisplayStatus(
    agentState: string | undefined,
    taskStatus: WorkflowStatus,
): 'running' | 'done' | 'stopped' {
    if (agentState && AGENT_DONE_STATES.has(agentState)) return 'done';
    if (taskStatus === 'running') return 'running';
    return taskStatus === 'completed' ? 'done' : 'stopped';
}

/**
 * Drop the phase name a label repeats. Workflow scripts conventionally prefix a
 * label with the phase it runs in (`probe:survivor-0` in phase `Probe`), which
 * is worth reading in a flat list but pure noise under a header that already
 * says `Probe` — and it costs width that the agent's own name needs.
 *
 * Only an exact `<phase>:` opening is removed, matched case-insensitively since
 * scripts lowercase the prefix. A label that merely happens to contain a colon
 * (`verify:phantom:0` under phase `Verify` → `phantom:0`) keeps everything past
 * the phase, and a label that does not start with this phase is left alone.
 */
function stripPhasePrefix(label: string, phaseTitle?: string): string {
    if (!phaseTitle) return label;
    const prefix = `${phaseTitle.toLowerCase()}:`;
    if (!label.toLowerCase().startsWith(prefix)) return label;
    const stripped = label.slice(prefix.length);
    // Never strip a label down to nothing: a chip has to say something.
    return stripped || label;
}

/**
 * Name to show for an agent. The script-supplied `label` is the real name, but
 * the CLI persists it nowhere, so an agent rebuilt from disk after a reload has
 * none and this has to fall back.
 *
 * A rebuilt agent does still carry the `result` its journal recorded, and a
 * workflow that returns a `topic` has effectively named its own agent, so that
 * reads far better than an id. Failing both, a slice of `agentId` at least
 * keeps the row identifiable. None of this is written back onto `label`: the
 * fallbacks are what to display, not a claim about what the CLI reported.
 */
export function agentDisplayName(
    agent: { label?: string; agentId?: string; result?: unknown },
    phaseTitle?: string,
): string {
    if (agent.label) return stripPhasePrefix(agent.label, phaseTitle);
    const topic = agent.result && typeof agent.result === 'object'
        ? (agent.result as Record<string, unknown>)['topic']
        : undefined;
    if (typeof topic === 'string' && topic.trim()) return topic.trim();
    return agent.agentId?.slice(0, 8) ?? '';
}

/**
 * Which kind of agent ran, as the CLI named it (`general-purpose` and the
 * like). Only a backgrounded Agent/Task has one.
 *
 * Stated live on `task_started`, and after a reload only on the tool call that
 * launched the task — the CLI persists none of its events.
 */
export function taskSubagentType(task: WorkflowTask): string | undefined {
    const fromEvent = task.events?.task_started?.['subagent_type'];
    if (typeof fromEvent === 'string' && fromEvent.trim()) return fromEvent.trim();
    const input = task.events?.tool_use?.['input'];
    const fromCall = input && typeof input === 'object' ? (input as Record<string, unknown>)['subagent_type'] : undefined;
    return typeof fromCall === 'string' && fromCall.trim() ? fromCall.trim() : undefined;
}
