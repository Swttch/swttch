import { useMemo } from 'react';
import type React from 'react';
import { useTranslation } from '@/i18n';
import type { WorkflowAgent, WorkflowTask } from '@/shared';
import { Tooltip } from '@/components/Tooltip';
import { useAgentTranscript } from '@/hooks/useAgentTranscript';
import { formatTokens, workflowToolUses } from '@/utils/workflowFormat';

/**
 * What the selected agent was asked, and what it gave back.
 *
 * An agent is a question and an answer, and the CLI reports both — as
 * `promptPreview` and `resultPreview`. Neither is readable from the transcript
 * below at a glance: it auto-scrolls to the end, so the prompt has already
 * scrolled off by the time the modal opens, and the returned value is a
 * separate thing from whatever the agent happened to say last.
 *
 * Everything else the CLI sends (model, tool calls, queue wait, retry, and what
 * the token figure is made of) is occasionally useful and never urgent, so it
 * hangs off one badge instead of taking a line of its own. The picker beside
 * this already carries the name, phase, status, tokens and duration; none of
 * that is repeated here.
 */
/**
 * One header, given whichever object it is describing.
 *
 * A workflow's agent arrives as the CLI's `workflow_progress[]` entry and a
 * backgrounded Agent/Task as its own task, and reading each is this
 * component's own business rather than something a caller pulls apart first.
 * Both are the same thing to look at, so both take the same path through here
 * and cannot drift apart.
 *
 * `transcriptDir` is the one thing a workflow's agent needs that is not on the
 * agent itself: its transcript lives in the workflow's directory, and the
 * token breakdown is computed from it.
 */
export function DetailHeader(props: { source: WorkflowAgent | WorkflowTask; transcriptDir?: string }) {
  const { source, transcriptDir } = props;
  // Split at a component boundary rather than a branch, so each side calls
  // only its own hooks: a workflow's agent fetches its transcript for the
  // token breakdown, and a task has no transcript of that kind to fetch and
  // should not be made to depend on a query client for one.
  return isWorkflowTask(source) ? (
    <TaskHeader task={source} />
  ) : (
    <AgentHeader agent={source} transcriptDir={transcriptDir} />
  );
}

/** A workflow's agent: the CLI's `workflow_progress[]` entry. */
function AgentHeader(props: { agent: WorkflowAgent; transcriptDir: string | undefined }) {
  const { agent, transcriptDir } = props;
  const { t } = useTranslation('chat');
  const breakdown = useTokenBreakdown(agent, transcriptDir);

  return (
    <HeaderLayout
      fields={fieldsFromAgent(agent)}
      meta={<MetaLines agent={agent} breakdown={breakdown} t={t} />}
    />
  );
}

/** A backgrounded Agent/Task: its own task events. */
function TaskHeader(props: { task: WorkflowTask }) {
  const { task } = props;
  const { t } = useTranslation('chat');
  return <HeaderLayout fields={fieldsFromTask(task)} meta={metaFromTask(task, t)} />;
}

function HeaderLayout(props: { fields: DetailHeaderFields; meta?: React.ReactNode }) {
  const { prompt, result, error, badge } = props.fields;
  const { meta } = props;

  // A rebuilt agent has none of this, because the CLI persists none of it. An
  // empty row of labels would be worse than no header at all.
  if (!prompt && !result && !error && !badge) return null;

  return (
    <div className="shrink-0 border-b border-border-subtle px-4 py-2 text-xs">
      <div className="flex items-start gap-2">
        {/* The labels are the CLI's own field names with `Preview` dropped, so
            the row says which field it is showing rather than inventing a word
            for it. */}
        <div className="min-w-0 flex-1 space-y-0.5">
          {prompt && <FieldRow label="Prompt" value={prompt} />}
          {result && <FieldRow label="Result" value={result} />}
        </div>
        {badge &&
          (meta ? (
            <Tooltip content={meta} placement="bottom">
              <span className="shrink-0 rounded bg-surface-hover px-1.5 py-0.5 text-text-tertiary">{badge}</span>
            </Tooltip>
          ) : (
            <span className="shrink-0 rounded bg-surface-hover px-1.5 py-0.5 text-text-tertiary">{badge}</span>
          ))}
      </div>

      {/* A failure is the one thing here that must not be a hover away. */}
      {error && <div className="mt-1 whitespace-pre-wrap break-words text-state-error-fg">{error}</div>}
    </div>
  );
}

function FieldRow(props: { label: string; value: string }) {
  const { label, value } = props;
  return (
    <div className="flex items-baseline gap-2">
      <span className="w-12 shrink-0 font-medium text-text-tertiary">{label}</span>
      <span className="min-w-0 flex-1 truncate text-text-secondary">{value}</span>
    </div>
  );
}

/** The metadata that hangs off the badge, one topic per line. */
function MetaLines(props: {
  agent: WorkflowAgent;
  breakdown: TokenBreakdown | undefined;
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  const { agent, breakdown, t } = props;

  const run: string[] = [];
  if (typeof agent.toolCalls === 'number') run.push(t('backgroundTasks.agentDetail.tools', { count: agent.toolCalls }));
  const queued = queueWaitMs(agent);
  if (queued !== undefined) run.push(t('backgroundTasks.agentDetail.queued', { value: formatShortDuration(queued) }));
  // A first attempt is the normal case and says nothing; a later one does.
  if (typeof agent.attempt === 'number' && agent.attempt > 1) {
    run.push(t('backgroundTasks.agentDetail.attempt', { count: agent.attempt }));
  }

  return (
    <div className="space-y-0.5">
      <div>{agent.model}</div>
      {run.length > 0 && <div className="text-text-primary/70">{run.join(' · ')}</div>}
      {breakdown && (
        <div className="tabular-nums text-text-primary/70">
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
    </div>
  );
}

/**
 * `claude-haiku-4-5-20251001` reads as `haiku 4.5`. The full id is a line of
 * the tooltip, so the badge only has to say which family and version ran.
 */
export function shortModelName(model: string): string {
  const cleaned = model
    .replace(/^claude-/, '')
    .replace(/\[.*\]$/, '')
    .replace(/-\d{8}$/, '');
  const [family, ...version] = cleaned.split('-');
  return version.length ? `${family} ${version.join('.')}` : family;
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
 * Split the agent's token figure into what it is made of: a chip reading 51.5k
 * is 10 new input tokens against 51165 read back from cache, so the figure
 * alone reads as a cost it is not.
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

/** What a header row shows, whoever worked it out. */
interface DetailHeaderFields {
  prompt?: string;
  result?: string;
  error?: string;
  badge?: string;
}

/** Only a task carries a `toolUseId`; only an agent entry carries `agentId`. */
function isWorkflowTask(source: WorkflowAgent | WorkflowTask): source is WorkflowTask {
  return typeof (source as WorkflowTask).toolUseId === 'string';
}

function trimmed(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  return text ? text : undefined;
}

function fieldsFromAgent(agent: WorkflowAgent): DetailHeaderFields {
  return {
    prompt: trimmed(agent.promptPreview),
    result: trimmed(agent.resultPreview),
    error: trimmed(agent.error),
    badge: agent.model ? shortModelName(agent.model) : undefined,
  };
}

/** The `input` of the tool call that launched a task, if it was kept. */
function taskToolInput(task: WorkflowTask): Record<string, unknown> {
  const input = task.events?.tool_use?.['input'];
  return input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
}

/**
 * A backgrounded Agent/Task says the same things under different names
 * depending on how it reached us, and both ways are read here rather than one
 * being preferred and the other lost:
 *
 * - the prompt is on `task_started` live, and on the launching `tool_use`
 *   after a reload, since the CLI persists no events;
 * - live there is no `result` and `summary` IS the value the agent returned;
 *   the reload envelope splits the two, and then `summary` is a sentence about
 *   the agent rather than from it, so it gets a row of its own instead of
 *   standing in for the answer.
 */
function fieldsFromTask(task: WorkflowTask): DetailHeaderFields {
  // `[0]` is the launch. Later entries are resumes, whose `prompt` is the
  // message that resumed the agent rather than the one it was asked to do.
  const started = task.events?.task_started?.[0];
  const input = taskToolInput(task);

  const model = trimmed(input['model']);

  return {
    prompt: trimmed(started?.['prompt']) ?? trimmed(input['prompt']),
    result: trimmed(task.result) ?? trimmed(task.summary),
    // No event reports the model, so an Agent launched with one is only
    // knowable from the call that launched it. Most name none and inherit the
    // session's, which is not ours to guess at — so there is simply no badge.
    badge: model ? shortModelName(model) : undefined,
  };
}

function metaFromTask(
  task: WorkflowTask,
  t: (key: string, options?: Record<string, unknown>) => string,
): React.ReactNode {
  const model = trimmed(taskToolInput(task)['model']);
  const toolUses = workflowToolUses(task.usage);

  const lines = [
    model,
    typeof toolUses === 'number' ? t('backgroundTasks.agentDetail.tools', { count: toolUses }) : undefined,
  ].filter((line): line is string => !!line);

  if (lines.length === 0) return undefined;
  return (
    <div className="space-y-0.5">
      {lines.map((line, i) => (
        <div key={i} className={i === 0 ? undefined : 'text-text-primary/70'}>
          {line}
        </div>
      ))}
    </div>
  );
}
