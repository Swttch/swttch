import { useMemo } from 'react';
import { useTranslation } from '@/i18n';
import type { WorkflowAgent } from '@/shared';
import { useAgentTranscript } from '@/hooks/useAgentTranscript';
import { formatTokens } from '@/utils/workflowFormat';

interface Props {
  agent: WorkflowAgent;
  transcriptDir: string | undefined;
}

/**
 * What the CLI reported about the selected agent that nothing else shows.
 *
 * The picker beside this already carries the agent's name, phase, status,
 * tokens and duration, and the transcript below opens with the very prompt the
 * agent was given — so none of that is repeated here. What is left had no home
 * at all: which model ran it, how long it waited to start, which retry this is,
 * what it handed back, why it failed, and what that token count is actually
 * made of.
 */
export function AgentDetailHeader(props: Props) {
  const { agent, transcriptDir } = props;
  const { t } = useTranslation('chat');
  const breakdown = useTokenBreakdown(agent, transcriptDir);

  const meta: string[] = [];
  if (agent.model) meta.push(agent.model);
  if (typeof agent.toolCalls === 'number') meta.push(t('backgroundTasks.agentDetail.tools', { count: agent.toolCalls }));
  const queued = queueWaitMs(agent);
  if (queued !== undefined) meta.push(t('backgroundTasks.agentDetail.queued', { value: formatShortDuration(queued) }));
  // A first attempt is the normal case and says nothing; a later one does.
  if (typeof agent.attempt === 'number' && agent.attempt > 1) {
    meta.push(t('backgroundTasks.agentDetail.attempt', { count: agent.attempt }));
  }

  const error = typeof agent.error === 'string' ? agent.error : undefined;
  const returned = typeof agent.resultPreview === 'string' ? agent.resultPreview.trim() : undefined;

  if (meta.length === 0 && !breakdown && !error && !returned) return null;

  return (
    <div className="shrink-0 border-b border-border-subtle px-4 py-2 text-xs text-text-tertiary">
      {meta.length > 0 && <div className="truncate">{meta.join(' · ')}</div>}

      {/* The chip's token figure is almost entirely cache reads — 51.4k for an
          agent that read 10 new tokens — so the number alone reads as a cost it
          is not. This is the one place that says what it is made of. */}
      {breakdown && (
        <div className="truncate tabular-nums">
          {t('backgroundTasks.agentDetail.context', { value: formatTokens(breakdown.total) ?? '0' })}
          {' · '}
          {t('backgroundTasks.agentDetail.in', { value: formatTokens(breakdown.input) ?? '0' })}
          {' · '}
          {t('backgroundTasks.agentDetail.cache', {
            written: formatTokens(breakdown.cacheWrite) ?? '0',
            read: formatTokens(breakdown.cacheRead) ?? '0',
          })}
          {' · '}
          {t('backgroundTasks.agentDetail.out', { value: formatTokens(breakdown.output) ?? '0' })}
        </div>
      )}

      {returned && (
        <div className="truncate">
          <span className="text-text-secondary">{t('backgroundTasks.agentDetail.returned')}</span> {returned}
        </div>
      )}

      {error && <div className="whitespace-pre-wrap break-words text-state-error-fg">{error}</div>}
    </div>
  );
}

/** How long the agent sat between being queued and actually starting. */
function queueWaitMs(agent: WorkflowAgent): number | undefined {
  const { queuedAt, startedAt } = agent;
  if (typeof queuedAt !== 'number' || typeof startedAt !== 'number') return undefined;
  const wait = startedAt - queuedAt;
  return wait > 0 ? wait : undefined;
}

/** Sub-second waits matter here, where formatDuration would round them to "0s". */
function formatShortDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

interface TokenBreakdown {
  total: number;
  input: number;
  cacheWrite: number;
  cacheRead: number;
  output: number;
}

/**
 * Split the agent's token figure into what it is made of.
 *
 * The live `task_progress` stream carries only the total, but the agent's own
 * transcript records a full `usage` per turn — and this modal has already
 * fetched it to render the messages. Asking for it under the same query key
 * reuses that response rather than issuing a second request.
 */
function useTokenBreakdown(agent: WorkflowAgent, transcriptDir: string | undefined): TokenBreakdown | undefined {
  const fingerprint = `${agent.tokens ?? 0}:${agent.toolCalls ?? 0}:${Math.floor((agent.durationMs ?? 0) / 2000)}`;
  const { data } = useAgentTranscript(transcriptDir, agent.agentId, fingerprint);

  return useMemo(() => {
    if (!data) return undefined;
    // The last assistant turn's usage is the agent's full context, which is the
    // same figure the CLI reports as its `tokens` (see computeAgentStats).
    let usage: Record<string, unknown> | undefined;
    for (const entry of data.entries) {
      if (entry['type'] !== 'assistant') continue;
      const message = entry['message'] as { usage?: Record<string, unknown> } | undefined;
      if (message?.usage) usage = message.usage;
    }
    if (!usage) return undefined;

    const n = (key: string) => (typeof usage![key] === 'number' ? (usage![key] as number) : 0);
    const input = n('input_tokens');
    const cacheWrite = n('cache_creation_input_tokens');
    const cacheRead = n('cache_read_input_tokens');
    const output = n('output_tokens');
    const total = input + cacheWrite + cacheRead + output;
    return total > 0 ? { total, input, cacheWrite, cacheRead, output } : undefined;
  }, [data]);
}
