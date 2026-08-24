/**
 * Tracks background dynamic workflows and streams live progress to the webview.
 *
 * Two data sources, because the runtime exposes the workflow differently live
 * vs. on reload:
 *
 * 1. LIVE — the CLI stdout stream emits rich `{type:'system', subtype:'task_*'}`
 *    events: `task_started` (id, name, script), `task_progress` (a
 *    `workflow_progress[]` array of per-agent objects with label, phase, state,
 *    tokens, toolCalls, durationMs) and `task_notification` (final status,
 *    output_file, usage). We translate these straight into a {@link WorkflowTask}
 *    and broadcast WORKFLOW_PROGRESS. These system events are NOT persisted.
 *
 * 2. RELOAD — {@link reconstructWorkflowTasks} rebuilds finished workflows from
 *    the persisted transcript (Workflow tool_use + immediate tool_result + the
 *    `<task-notification>` user message) plus the on-disk runtime files
 *    (`journal.jsonl` + per-agent `agent-<id>.jsonl`). Here agent labels are
 *    best-effort (derived from results) and tokens are approximated, since the
 *    structured live events aren't available.
 */

import { join } from 'path';
import { existsSync, readFileSync } from 'fs';
import type { ConnectionManager } from '../../ws/connection-manager';
import { MessageType } from '../../shared';
import type {
  WorkflowTask,
  WorkflowAgent,
  WorkflowPhase,
  WorkflowStatus,
} from '../../shared';
import { readJsonlEntries } from './readJsonlEntries';

/** Live agent `state` values that count as finished. */
const AGENT_DONE_STATES = new Set(['done', 'completed', 'success']);

interface WatchEntry {
  sessionId: string;
  task: WorkflowTask;
  /**
   * Accumulated agents keyed by their stable slot `phaseIndex:index`.
   * `task_progress` events are deltas (only the changed agent), and `agentId`
   * is the runtime instance — it changes when a slot is retried/rerun — so we
   * key by slot and MERGE fields, then rebuild `task.agents` ordered by slot.
   */
  agents: Map<string, { order: number; agent: WorkflowAgent }>;
  lastSerialized?: string;
}

// ── event parsing helpers ────────────────────────────────────

function getContentBlocks(event: Record<string, unknown>): Array<Record<string, unknown>> {
  const message = event['message'] as { content?: unknown } | undefined;
  const content = message?.content;
  return Array.isArray(content) ? (content as Array<Record<string, unknown>>) : [];
}

/** Plain text of a user event whose content is a string or text-block array. */
function getEventText(event: Record<string, unknown>): string {
  const message = event['message'] as { content?: unknown } | undefined;
  const content = message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((b) => {
        const block = b as Record<string, unknown>;
        return block['type'] === 'text' && typeof block['text'] === 'string' ? (block['text'] as string) : '';
      })
      .join('');
  }
  return '';
}

function parseXmlTag(text: string, tag: string): string | undefined {
  const match = text.match(new RegExp(`<${tag}>(.*?)</${tag}>`, 's'));
  return match?.[1]?.trim();
}

function toInt(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : undefined;
}

function parseMetaName(script: string | undefined): string | undefined {
  if (!script) return undefined;
  return script.match(/name\s*:\s*['"]([^'"]+)['"]/)?.[1];
}

/** Best-effort parse of `meta.phases: [{ title, detail }]` from the script. */
function parseMetaPhases(script: string | undefined): WorkflowPhase[] {
  if (!script) return [];
  const block = script.match(/phases\s*:\s*\[([\s\S]*?)\]/)?.[1];
  if (!block) return [];
  const phases: WorkflowPhase[] = [];
  for (const obj of block.match(/\{[^}]*\}/g) ?? []) {
    const title = obj.match(/title\s*:\s*['"]([^'"]+)['"]/)?.[1];
    if (!title) continue;
    const detail = obj.match(/detail\s*:\s*['"]([^'"]+)['"]/)?.[1];
    phases.push(detail ? { title, detail } : { title });
  }
  return phases;
}

function scriptPathName(scriptPath: string | undefined): string | undefined {
  if (!scriptPath) return undefined;
  const base = scriptPath.split(/[\\/]/).pop() ?? scriptPath;
  return base.replace(/\.[cm]?[jt]s$/i, '');
}

/** Parse the immediate "launched in background" tool_result text for a Workflow run. */
function parseImmediateResult(text: string): { taskId?: string; transcriptDir?: string } {
  const taskId = text.match(/Task ID:\s*(\S+)/)?.[1];
  const transcriptDir = text.match(/Transcript dir:\s*(.+)/)?.[1]?.trim();
  return { taskId, transcriptDir };
}

/**
 * Parse the immediate "Command running in background" tool_result text for a
 * plain Bash background task — a different shape from the Workflow tool's
 * (e.g. "Command running in background with ID: b0i10sn6r. Output is being
 * written to: /tmp/.../b0i10sn6r.output. …"). Read live rather than waiting for
 * the terminal task_notification, so the output log is fetchable immediately —
 * mirroring how transcriptDir is available before a workflow finishes (#347).
 */
function parseImmediateBashResult(text: string): { taskId?: string; outputFile?: string } {
  const taskId = text.match(/Command running in background with ID:\s*(\S+?)\.?\s/)?.[1];
  const outputFile = text.match(/Output is being written to:\s*(.+?)\.\s/)?.[1]?.trim();
  return { taskId, outputFile };
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

// ── per-agent stat computation ───────────────────────────────

interface AgentStats {
  tokens: number;
  tools: number;
  durationMs: number;
}

/**
 * Compute a subagent's stats from its transcript. Tokens are the last assistant
 * turn's full context — input + cache-creation + cache-read + output — which
 * matches the live `task_progress` per-agent figure (cache-read dominates a
 * subagent's turn via context reuse, so it must be counted, else reload reads
 * ~30x low). tools = count of tool_use blocks; duration = span of timestamps.
 * Approximate by design — see the file header limitation note.
 */
async function computeAgentStats(file: string): Promise<AgentStats> {
  if (!existsSync(file)) return { tokens: 0, tools: 0, durationMs: 0 };
  let entries;
  try {
    entries = await readJsonlEntries(file);
  } catch {
    return { tokens: 0, tools: 0, durationMs: 0 };
  }
  let tools = 0;
  let firstTs: number | undefined;
  let lastTs: number | undefined;
  let lastUsage: Record<string, unknown> | undefined;
  for (const entry of entries) {
    const ts = entry['timestamp'];
    if (typeof ts === 'string') {
      const t = Date.parse(ts);
      if (Number.isFinite(t)) {
        if (firstTs === undefined) firstTs = t;
        lastTs = t;
      }
    }
    const message = entry['message'] as { content?: unknown; usage?: unknown } | undefined;
    const content = message?.content;
    if (Array.isArray(content)) {
      tools += content.filter((b) => (b as Record<string, unknown>)['type'] === 'tool_use').length;
    }
    if (message?.usage && typeof message.usage === 'object') {
      lastUsage = message.usage as Record<string, unknown>;
    }
  }
  const tokens = lastUsage
    ? num(lastUsage['input_tokens']) +
      num(lastUsage['cache_creation_input_tokens']) +
      num(lastUsage['cache_read_input_tokens']) +
      num(lastUsage['output_tokens'])
    : 0;
  const durationMs = firstTs !== undefined && lastTs !== undefined ? lastTs - firstTs : 0;
  return { tokens, tools, durationMs };
}

/** Derive a display label from an agent's journal result (best-effort). */
function deriveLabel(result: unknown, agentId: string): string {
  if (result && typeof result === 'object') {
    const topic = (result as Record<string, unknown>)['topic'];
    if (typeof topic === 'string' && topic.trim()) return topic.trim();
  }
  return agentId.slice(0, 8);
}

/**
 * Aggregate per-agent progress for a workflow by reading its journal + agent
 * transcripts. Shared by the live poller and the historical reconstruction.
 */
async function aggregateAgents(transcriptDir: string): Promise<WorkflowAgent[]> {
  if (!existsSync(transcriptDir)) return [];
  const journalPath = join(transcriptDir, 'journal.jsonl');
  if (!existsSync(journalPath)) return [];

  let journal;
  try {
    journal = await readJsonlEntries(journalPath);
  } catch {
    return [];
  }

  const order: string[] = [];
  const results = new Map<string, unknown>();
  for (const rec of journal) {
    const agentId = rec['agentId'];
    if (typeof agentId !== 'string') continue;
    if (rec['type'] === 'started' && !order.includes(agentId)) order.push(agentId);
    if (rec['type'] === 'result') {
      results.set(agentId, rec['result']);
      if (!order.includes(agentId)) order.push(agentId);
    }
  }

  const agents: WorkflowAgent[] = [];
  for (const agentId of order) {
    const stats = await computeAgentStats(join(transcriptDir, `agent-${agentId}.jsonl`));
    agents.push({
      agentId,
      label: deriveLabel(results.get(agentId), agentId),
      status: results.has(agentId) ? 'done' : 'running',
      tokens: stats.tokens,
      tools: stats.tools,
      durationMs: stats.durationMs,
    });
  }
  return agents;
}

/** Apply a `<task-notification>` envelope's fields onto a task (no I/O). */
function applyNotification(task: WorkflowTask, text: string): void {
  const usageBlock = parseXmlTag(text, 'usage') ?? '';
  const status = parseXmlTag(text, 'status') as WorkflowStatus | undefined;
  task.status = status ?? 'completed';
  task.summary = parseXmlTag(text, 'summary');
  task.result = parseXmlTag(text, 'result');
  task.outputFile = parseXmlTag(text, 'output-file');
  task.taskId = task.taskId ?? parseXmlTag(text, 'task-id');
  task.usage = {
    agentCount: toInt(parseXmlTag(usageBlock, 'agent_count')),
    subagentTokens: toInt(parseXmlTag(usageBlock, 'subagent_tokens')),
    toolUses: toInt(parseXmlTag(usageBlock, 'tool_uses')),
    durationMs: toInt(parseXmlTag(usageBlock, 'duration_ms')),
  };
}

/**
 * Settle still-running agents to match a terminal workflow status: a `completed`
 * workflow finished them (→ `done`, green); a `stopped`/`failed` one cut them off
 * (→ `stopped`, grey). Never paint an interrupted agent as a success. No-op while
 * the workflow is still running.
 */
function settleAgents(agents: WorkflowAgent[], status: WorkflowStatus): void {
  if (status === 'running') return;
  const settled = status === 'completed' ? 'done' : 'stopped';
  for (const a of agents) if (a.status === 'running') a.status = settled;
}

function eventTimestamp(event: Record<string, unknown>): number {
  const ts = event['timestamp'];
  if (typeof ts === 'string') {
    const t = Date.parse(ts);
    if (Number.isFinite(t)) return t;
  }
  return 0;
}

/**
 * Reconstruct finished/running workflows from a loaded session transcript so the
 * Background tasks panel and inline cards populate on reload (the live stream is
 * not replayed). Scans for the Workflow tool_use, its immediate tool_result
 * (transcript dir) and the `<task-notification>`, then aggregates agent stats
 * from the runtime files on disk.
 *
 * `isLive(toolUseId)` reports whether the workflow is still actually running in
 * this process (its live tracker entry exists and is `running`). A workflow with
 * no terminal `<task-notification>` is otherwise indistinguishable from one that
 * was interrupted — without this check reconstruction would resurrect a stopped
 * workflow as `running` on every reload. When not live, such a workflow settles
 * to `stopped`; the live stream still drives genuinely-running ones.
 */
export async function reconstructWorkflowTasks(
  messages: Array<Record<string, unknown>>,
  isLive?: (toolUseId: string) => boolean,
): Promise<WorkflowTask[]> {
  const tasks = new Map<string, WorkflowTask>();

  for (const msg of messages) {
    if (msg['type'] !== 'assistant') continue;
    for (const block of getContentBlocks(msg)) {
      if (block['type'] !== 'tool_use' || block['name'] !== 'Workflow') continue;
      const toolUseId = block['id'];
      if (typeof toolUseId !== 'string' || tasks.has(toolUseId)) continue;
      const input = (block['input'] as Record<string, unknown> | undefined) ?? {};
      const script = typeof input['script'] === 'string' ? (input['script'] as string) : undefined;
      const scriptPath = typeof input['scriptPath'] === 'string' ? (input['scriptPath'] as string) : undefined;
      const description = typeof input['description'] === 'string' ? (input['description'] as string) : undefined;
      tasks.set(toolUseId, {
        toolUseId,
        name: parseMetaName(script) || scriptPathName(scriptPath) || description || 'workflow',
        description,
        // Default only — overwritten by applyNotification when a terminal
        // <task-notification> exists. A workflow with no notification that is
        // not live was interrupted, so it must not come back as 'running'.
        status: isLive?.(toolUseId) ? 'running' : 'stopped',
        startedAt: eventTimestamp(msg),
        phases: parseMetaPhases(script),
        agents: [],
      });
    }
  }

  if (tasks.size === 0) return [];

  for (const msg of messages) {
    if (msg['type'] !== 'user') continue;
    for (const block of getContentBlocks(msg)) {
      if (block['type'] !== 'tool_result') continue;
      const toolUseId = block['tool_use_id'];
      if (typeof toolUseId !== 'string') continue;
      const task = tasks.get(toolUseId);
      if (!task || task.transcriptDir) continue;
      const content = block['content'];
      const text = typeof content === 'string' ? content : getEventText(msg);
      const { taskId, transcriptDir } = parseImmediateResult(text);
      if (transcriptDir) {
        task.taskId = taskId ?? task.taskId;
        task.transcriptDir = transcriptDir;
        task.workflowId = transcriptDir.split(/[\\/]/).pop();
      }
    }
    const text = getEventText(msg);
    if (text.includes('<task-notification>')) {
      const toolUseId = parseXmlTag(text, 'tool-use-id');
      const task = toolUseId ? tasks.get(toolUseId) : undefined;
      if (task) applyNotification(task, text);
    }
  }

  for (const task of tasks.values()) {
    if (task.transcriptDir) {
      task.agents = await aggregateAgents(task.transcriptDir);
    }
    // A terminal workflow has no running agents — settle any the journal left
    // open (no `result` recorded) so a finished card doesn't show pulsing
    // "running" dots after reload. Interrupted agents go grey, not green.
    settleAgents(task.agents, task.status);
  }

  return [...tasks.values()];
}

// ── the tracker ──────────────────────────────────────────────

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v ? v : undefined;
}

export class WorkflowProgressTracker {
  /** key = `${sessionId}::${toolUseId}` */
  private readonly entries = new Map<string, WatchEntry>();

  private constructor(private readonly connections: ConnectionManager) {}

  static create(connections: ConnectionManager): WorkflowProgressTracker {
    return new WorkflowProgressTracker(connections);
  }

  /** Feed every CLI stream event here (side-effect only; never throws). */
  handleEvent(sessionId: string, event: Record<string, unknown>): void {
    try {
      if (event['type'] === 'system') {
        const subtype = event['subtype'];
        if (subtype === 'task_started') this.onStarted(sessionId, event);
        else if (subtype === 'task_progress' || subtype === 'task_updated') this.onProgress(sessionId, event);
        else if (subtype === 'task_notification') this.onNotification(sessionId, event);
      } else if (event['type'] === 'user') {
        this.onImmediateResult(sessionId, event);
      }
    } catch (err) {
      console.error('[node-backend]', 'workflow-tracker handleEvent failed:', err);
    }
  }

  private key(sessionId: string, toolUseId: string): string {
    return `${sessionId}::${toolUseId}`;
  }

  private ensureEntry(sessionId: string, toolUseId: string): WatchEntry {
    const key = this.key(sessionId, toolUseId);
    let entry = this.entries.get(key);
    if (!entry) {
      entry = {
        sessionId,
        task: { toolUseId, name: 'workflow', status: 'running', startedAt: Date.now(), phases: [], agents: [] },
        agents: new Map(),
      };
      this.entries.set(key, entry);
    }
    return entry;
  }

  private onStarted(sessionId: string, event: Record<string, unknown>): void {
    const toolUseId = event['tool_use_id'];
    if (typeof toolUseId !== 'string') return;
    const entry = this.ensureEntry(sessionId, toolUseId);
    const t = entry.task;
    const prompt = typeof event['prompt'] === 'string' ? (event['prompt'] as string) : undefined;
    if (typeof event['task_id'] === 'string') t.taskId = event['task_id'] as string;
    const taskType = event['task_type'];
    if (taskType === 'local_workflow' || taskType === 'local_bash') t.taskType = taskType;
    const description = typeof event['description'] === 'string' ? (event['description'] as string) : undefined;
    if (description) t.description = description;
    const wfName = typeof event['workflow_name'] === 'string' ? (event['workflow_name'] as string) : '';
    // A plain background Bash command has no workflow_name/meta script to name
    // itself with — fall back to its description rather than leaving the
    // placeholder 'workflow' (issue #347: that placeholder is what made the
    // panel mislabel bash tasks as "workflow" with a transcript modal that had
    // nothing to show).
    t.name = wfName || parseMetaName(prompt) || description || t.name;
    if (t.phases.length === 0) t.phases = parseMetaPhases(prompt);
    t.startedAt = Date.now();
    this.broadcast(entry);
  }

  private onProgress(sessionId: string, event: Record<string, unknown>): void {
    const toolUseId = event['tool_use_id'];
    if (typeof toolUseId !== 'string') return;
    const entry = this.ensureEntry(sessionId, toolUseId);
    const t = entry.task;
    if (typeof event['task_id'] === 'string') t.taskId = event['task_id'] as string;

    const wp = event['workflow_progress'];
    if (Array.isArray(wp)) {
      // Merge each delta into its slot, keyed by the agent's global `index`
      // (stable across retries/reruns, where `agentId` changes and `phaseIndex`
      // may be absent on early "queued" deltas). Later deltas carry more
      // complete state; empty fields fall back to the previously-seen value.
      for (const raw of wp) {
        if (!raw || typeof raw !== 'object') continue;
        const a = raw as Record<string, unknown>;
        const agentId0 = str(a['agentId']);
        const label0 = str(a['label']);
        // Skip pure placeholder deltas with no identity yet (no id and no label).
        if (!agentId0 && !label0) continue;
        const index = num(a['index']);
        const slot = String(index);
        const prev = entry.agents.get(slot)?.agent;
        const state = str(a['state']);
        const agentId = agentId0 ?? prev?.agentId ?? slot;
        const agent: WorkflowAgent = {
          agentId,
          label: label0 ?? prev?.label ?? agentId.slice(0, 8),
          status: state ? (AGENT_DONE_STATES.has(state) ? 'done' : 'running') : (prev?.status ?? 'running'),
          tokens: a['tokens'] != null ? num(a['tokens']) : (prev?.tokens ?? 0),
          tools: a['toolCalls'] != null ? num(a['toolCalls']) : (prev?.tools ?? 0),
          durationMs: a['durationMs'] != null ? num(a['durationMs']) : (prev?.durationMs ?? 0),
        };
        entry.agents.set(slot, { order: index, agent });
      }
      t.agents = [...entry.agents.values()].sort((x, y) => x.order - y.order).map((v) => v.agent);
    }

    // Live workflow-level usage. Omit durationMs while running so the inline
    // card's client-side timer keeps ticking; it is set on finalize.
    const usage = event['usage'] as Record<string, unknown> | undefined;
    if (usage) {
      t.usage = {
        agentCount: t.agents.length || undefined,
        subagentTokens: num(usage['total_tokens']) || undefined,
        toolUses: num(usage['tool_uses']) || undefined,
      };
    }
    this.broadcast(entry);
  }

  private onNotification(sessionId: string, event: Record<string, unknown>): void {
    const toolUseId = event['tool_use_id'];
    if (typeof toolUseId !== 'string') return;
    const entry = this.entries.get(this.key(sessionId, toolUseId));
    if (!entry) return;
    const t = entry.task;

    const status = typeof event['status'] === 'string' ? (event['status'] as WorkflowStatus) : undefined;
    t.status = status ?? 'completed';
    // Settle stragglers whose final delta we missed: a completed workflow
    // finished them (green); a stopped/failed one cut them off (grey).
    settleAgents(t.agents, t.status);
    if (typeof event['summary'] === 'string') t.summary = event['summary'] as string;
    if (typeof event['task_id'] === 'string') t.taskId = event['task_id'] as string;

    const outputFile = typeof event['output_file'] === 'string' ? (event['output_file'] as string) : undefined;
    if (outputFile) {
      t.outputFile = outputFile;
      // Only a dynamic workflow's output file is the JSON envelope
      // readOutputFile expects ({summary, result}); a plain background Bash
      // task's output file is its raw stdout/stderr log (issue #347) — its
      // summary/status already came from this event, and its "result" is the
      // log itself, read separately by GET_BACKGROUND_TASK_OUTPUT on demand.
      if (t.taskType !== 'local_bash') {
        const parsed = readOutputFile(outputFile);
        if (parsed.summary && !event['summary']) t.summary = parsed.summary;
        if (parsed.result !== undefined) t.result = parsed.result;
      }
    }

    const usage = event['usage'] as Record<string, unknown> | undefined;
    t.usage = {
      agentCount: t.agents.length || num(usage?.['agent_count']) || undefined,
      subagentTokens: num(usage?.['total_tokens']) || undefined,
      toolUses: num(usage?.['tool_uses']) || undefined,
      durationMs: num(usage?.['duration_ms']) || undefined,
    };
    t.endedAt = Date.now();
    this.broadcast(entry);
  }

  /**
   * The Workflow tool's immediate tool_result (not a `task_*` system event —
   * an ordinary `type:'user'` message) carries `transcriptDir` in its text
   * ("Transcript dir: …"). `task_progress` never repeats it, so without this
   * the live task never learns its transcriptDir until a reload runs
   * reconstructWorkflowTasks — leaving the agent-transcript modal unable to
   * fetch anything for a workflow that is still running (issue #347).
   */
  private onImmediateResult(sessionId: string, event: Record<string, unknown>): void {
    for (const block of getContentBlocks(event)) {
      if (block['type'] !== 'tool_result') continue;
      const toolUseId = block['tool_use_id'];
      if (typeof toolUseId !== 'string') continue;
      const entry = this.entries.get(this.key(sessionId, toolUseId));
      if (!entry) continue;
      const content = block['content'];
      const text = typeof content === 'string' ? content : getEventText(event);

      if (entry.task.taskType === 'local_bash') {
        // A plain background Bash task has no transcriptDir/agents — its
        // output log path is available immediately, same as a workflow's
        // transcriptDir, well before the terminal task_notification (#347).
        if (entry.task.outputFile) continue;
        const { taskId, outputFile } = parseImmediateBashResult(text);
        if (!outputFile) continue;
        entry.task.taskId = taskId ?? entry.task.taskId;
        entry.task.outputFile = outputFile;
        this.broadcast(entry);
        continue;
      }

      if (entry.task.transcriptDir) continue;
      const { taskId, transcriptDir } = parseImmediateResult(text);
      if (!transcriptDir) continue;
      entry.task.taskId = taskId ?? entry.task.taskId;
      entry.task.transcriptDir = transcriptDir;
      entry.task.workflowId = transcriptDir.split(/[\\/]/).pop();
      this.broadcast(entry);
    }
  }

  private broadcast(entry: WatchEntry): void {
    const serialized = JSON.stringify(entry.task);
    if (serialized === entry.lastSerialized) return;
    entry.lastSerialized = serialized;
    this.connections.broadcastToSession(
      entry.sessionId,
      MessageType.WORKFLOW_PROGRESS,
      entry.task as unknown as Record<string, unknown>,
    );
  }

  /**
   * Settle a still-running workflow as `stopped` and push a final update.
   * No-op once the workflow has reached a terminal status (completed/failed/
   * stopped), so a normal `task_notification` finish is never overwritten.
   */
  private settleStopped(entry: WatchEntry): void {
    if (entry.task.status !== 'running') return;
    const t = entry.task;
    t.status = 'stopped';
    t.endedAt = Date.now();
    settleAgents(t.agents, t.status);
    t.usage = { ...t.usage, durationMs: t.usage?.durationMs ?? t.endedAt - t.startedAt };
    this.broadcast(entry);
  }

  /**
   * Whether a workflow is still actually running in this process — a live entry
   * exists and has not reached a terminal status. Used by reconstruction to tell
   * a genuinely-running workflow apart from a stopped one that lacks a terminal
   * `<task-notification>` in the transcript.
   */
  isRunning(sessionId: string, toolUseId: string): boolean {
    return this.entries.get(this.key(sessionId, toolUseId))?.task.status === 'running';
  }

  /**
   * Settle every still-running workflow of a session as `stopped` (e.g. the user
   * interrupted generation). Entries are KEPT — the CLI process is still alive,
   * so the panel keeps showing them under "Finished" rather than dropping them.
   */
  stopRunning(sessionId: string): void {
    for (const entry of this.entries.values()) {
      if (entry.sessionId === sessionId) this.settleStopped(entry);
    }
  }

  /** Forget all workflows for a session (on CLI process close). */
  stopSession(sessionId: string): void {
    for (const [key, entry] of this.entries) {
      if (entry.sessionId !== sessionId) continue;
      // The process is gone, so a still-running workflow can never reach a
      // terminal task_notification — settle + broadcast it as stopped before
      // dropping the entry, otherwise the webview hangs it on "running" forever.
      this.settleStopped(entry);
      this.entries.delete(key);
    }
  }
}

/** Read a workflow task `.output` JSON file for its summary + result (best-effort). */
function readOutputFile(path: string): { summary?: string; result?: string } {
  try {
    if (!existsSync(path)) return {};
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as Record<string, unknown>;
    const summary = typeof parsed['summary'] === 'string' ? (parsed['summary'] as string) : undefined;
    const rawResult = parsed['result'];
    const result =
      rawResult === undefined
        ? undefined
        : typeof rawResult === 'string'
          ? rawResult
          : JSON.stringify(rawResult, null, 2);
    return { summary, result };
  } catch {
    return {};
  }
}
