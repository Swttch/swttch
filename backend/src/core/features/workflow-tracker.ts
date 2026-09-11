/**
 * Tracks background dynamic workflows and streams live progress to the webview.
 *
 * Two data sources, because the runtime exposes the workflow differently live
 * vs. on reload:
 *
 * 1. LIVE — the CLI stdout stream emits rich `{type:'system', subtype:'task_*'}`
 *    events: `task_started` (id, name, script), `task_progress` (a
 *    `workflow_progress[]` array of per-agent objects carrying label, model,
 *    phase, state, promptPreview, attempt, tokens, toolCalls, durationMs and
 *    error) and `task_notification` (final status, output_file, usage). Each
 *    per-agent object is merged into {@link WorkflowTask} and broadcast on
 *    WORKFLOW_PROGRESS **as the CLI sent it**, field names and all.
 *
 * 2. RELOAD — {@link reconstructWorkflowTasks} rebuilds finished workflows from
 *    the persisted transcript (Workflow tool_use + immediate tool_result + the
 *    `<task-notification>` user message) plus the on-disk runtime files
 *    (`journal.jsonl` + per-agent `agent-<id>.jsonl`).
 *
 * The two are not equivalent, and the gap is the CLI's: the `task_*` events are
 * never persisted, and the runtime files record only `agentId` and `result`. So
 * a reloaded agent genuinely has no label, model or promptPreview to give, and
 * its tokens are recomputed from the transcript rather than reported. Rebuilt
 * agents are flagged `reconstructed` and leave the unknown fields absent, so
 * nothing downstream mistakes a stand-in for something the CLI said.
 */

import { join } from 'path';
import { existsSync, readFileSync } from 'fs';
import type { ConnectionManager } from '../../ws/connection-manager';
import { MessageType } from '../../shared';
import type {
  BackgroundTaskType,
  WorkflowTask,
  WorkflowAgent,
  WorkflowPhase,
  WorkflowStatus,
  WorkflowUsage,
} from '../../shared';
import { readJsonlEntries } from './readJsonlEntries';
import { loadWorkflowAgentSnapshot, saveWorkflowAgentSnapshot } from './workflowAgentSnapshot';

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

/**
 * Parse the immediate "Async agent launched successfully" tool_result text for
 * a backgrounded Agent/Task call — a third shape, distinct from both the
 * Workflow tool's ("Task ID:"/"Transcript dir:") and plain Bash's ("Command
 * running in background with ID:"/"Output is being written to:"). Its
 * `output_file` is the agent's own JSONL transcript, available immediately
 * rather than only at the terminal task_notification (issue #383).
 */
function parseImmediateAgentResult(text: string): { agentId?: string; outputFile?: string } {
  const outputFile = text.match(/output_file:\s*(.+)/)?.[1]?.trim();
  // The same value the terminal notification later reports as <task-id>, and
  // the address SendMessage takes to resume this agent. It is only ever stated
  // here, so a reload that skips this line has no id for the task at all.
  const agentId = text.match(/agentId:\s*([a-zA-Z0-9_-]+)/)?.[1];
  return { agentId, outputFile };
}

/**
 * Which kind of background task a tool_use starts, or `undefined` if it starts
 * none. This is the reload-side counterpart of the `task_type` the CLI states
 * on `task_started`, and it has to be derived rather than read because the
 * persisted transcript records the tool call, not the system event.
 *
 * `Agent` and `Bash` each run inline unless explicitly backgrounded, so the
 * flag is what separates a task from an ordinary call. `Workflow` always runs
 * in the background and carries no such flag.
 */
function backgroundTaskType(block: Record<string, unknown>): BackgroundTaskType | undefined {
  const name = block['name'];
  if (name === 'Workflow') return 'local_workflow';
  const input = (block['input'] as Record<string, unknown> | undefined) ?? {};
  if (input['run_in_background'] !== true) return undefined;
  if (name === 'Agent') return 'local_agent';
  if (name === 'Bash') return 'local_bash';
  return undefined;
}

/**
 * Parse a `<tool_use_error>No task found with ID: <id></tool_use_error>` —
 * the CLI's answer when a tool (TaskStop, TaskGet, …) targets a task_id it no
 * longer has any record of, e.g. a backgrounded agent whose owning CLI
 * session already exited (issue #383). Unlike the absence of a terminal
 * `task_notification` — which just as easily means "still running, hasn't
 * finished" — this is definitive negative evidence: whatever the WORKFLOW
 * tracker still believes about that task_id, the CLI does not. Not scoped to
 * TaskStop specifically: any tool surfacing this for a task_id we are
 * tracking as running is equally trustworthy evidence it no longer is.
 */
function parseTaskNotFoundId(text: string): string | undefined {
  return text.match(/No task found with ID:\s*([a-zA-Z0-9_-]+)/)?.[1];
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

/**
 * Aggregate per-agent progress for a workflow by reading its journal + agent
 * transcripts, used when rebuilding a workflow after a reload.
 *
 * Prefers the snapshot this backend wrote while the workflow was streaming: it
 * holds the CLI's own entries, so a reloaded workflow shows the same agent
 * names, models and prompts the live one did. Only a workflow that streamed
 * before snapshots existed — or on another machine — falls through to what the
 * runtime files alone can tell us, which is far less.
 */
async function aggregateAgents(transcriptDir: string): Promise<WorkflowAgent[]> {
  const workflowId = transcriptDir.split(/[\\/]/).pop();
  if (workflowId) {
    const snapshot = await loadWorkflowAgentSnapshot(workflowId);
    if (snapshot) return snapshot;
  }
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
    // Only what the runtime files actually record. The CLI persists none of the
    // live fields (no label, model, promptPreview or attempt anywhere on disk —
    // journal.jsonl holds `type`/`key`/`agentId`/`result` and nothing else), so
    // they stay absent rather than being filled with a stand-in. A made-up
    // value would be indistinguishable from one the CLI sent; `reconstructed`
    // is what lets the webview tell the reader which of the two it is looking
    // at, and `state` carries the one lifecycle fact the journal does record.
    agents.push({
      agentId,
      state: results.has(agentId) ? 'done' : undefined,
      // The agent's return value, as journal.jsonl recorded it. It is the one
      // per-agent payload the CLI does persist, so it travels on untouched;
      // what a workflow puts in there is its own business, and the webview is
      // where any of it gets turned into something to look at.
      result: results.get(agentId),
      tokens: stats.tokens,
      toolCalls: stats.tools,
      durationMs: stats.durationMs,
      reconstructed: true,
    });
  }
  return agents;
}

/**
 * Every top-level tag of an XML-ish block, under the tag's own name.
 *
 * Reading a fixed list of tags means a tag the CLI adds later is dropped
 * silently, which is how `<note>` — the envelope's own warning that an agent
 * can be resumed and so may notify under the same task-id more than once —
 * never reached anything that could act on it.
 */
function parseXmlTags(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of block.matchAll(/<([a-zA-Z0-9_-]+)>([\s\S]*?)<\/\1>/g)) {
    out[m[1]] = m[2].trim();
  }
  return out;
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
  // The envelope's own tag names, kept as written. They differ from the live
  // events' names for the same figures (`subagent_tokens` here vs
  // `total_tokens` there), and that difference is the CLI's, not ours to
  // normalise away.
  const usage: WorkflowUsage = {};
  for (const [tag, value] of Object.entries(parseXmlTags(usageBlock))) {
    const n = toInt(value);
    usage[tag] = n ?? value;
  }
  if (Object.keys(usage).length > 0) task.usage = usage;
  // Whatever else the envelope carried, minus the fields already read above
  // into their own places. `<note>` arrives here. Scanned from inside the
  // envelope, so the envelope's own tag is not counted as one of its contents.
  const rest = parseXmlTags(parseXmlTag(text, 'task-notification') ?? '');
  for (const known of ['status', 'summary', 'result', 'output-file', 'task-id', 'tool-use-id', 'usage']) {
    delete rest[known];
  }
  if (Object.keys(rest).length > 0) task.notification = rest;
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
      if (block['type'] !== 'tool_use') continue;
      // All three kinds of background task are reconstructed, not just
      // workflows. Scanning for `Workflow` alone is what left a reloaded
      // session showing none of the backgrounded Agent/Bash tasks it had
      // started: the live stream is not replayed, so a task the reload does
      // not rebuild is one the panel never hears about again.
      const taskType = backgroundTaskType(block);
      if (!taskType) continue;
      const toolUseId = block['id'];
      if (typeof toolUseId !== 'string' || tasks.has(toolUseId)) continue;
      const input = (block['input'] as Record<string, unknown> | undefined) ?? {};
      const script = typeof input['script'] === 'string' ? (input['script'] as string) : undefined;
      const scriptPath = typeof input['scriptPath'] === 'string' ? (input['scriptPath'] as string) : undefined;
      const description = typeof input['description'] === 'string' ? (input['description'] as string) : undefined;
      tasks.set(toolUseId, {
        toolUseId,
        taskType,
        // Same order the live path names a task in (see onStarted): a
        // workflow names itself from its script, and the other two have only
        // their description to go by.
        name:
          taskType === 'local_workflow'
            ? parseMetaName(script) || scriptPathName(scriptPath) || description || 'workflow'
            : description || taskType,
        description,
        // Default only — overwritten by applyNotification when a terminal
        // <task-notification> exists. A task with no notification that is
        // not live was interrupted, so it must not come back as 'running'.
        status: isLive?.(toolUseId) ? 'running' : 'stopped',
        startedAt: eventTimestamp(msg),
        // Phases are declared by a workflow script; the other two have none.
        phases: taskType === 'local_workflow' ? parseMetaPhases(script) : [],
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
      if (!task) continue;
      const content = block['content'];
      const text = typeof content === 'string' ? content : getEventText(msg);

      // Each kind announces itself in its own words, so each gets its own
      // parser — the same three shapes the live path already distinguishes in
      // onImmediateResult.
      if (task.taskType === 'local_agent') {
        if (task.outputFile) continue;
        const { agentId, outputFile } = parseImmediateAgentResult(text);
        if (outputFile) task.outputFile = outputFile;
        // The agent's id doubles as its task id, and this line is the only
        // place a reload can learn it before the terminal notification.
        if (agentId) task.taskId = task.taskId ?? agentId;
        continue;
      }

      if (task.taskType === 'local_bash') {
        if (task.outputFile) continue;
        const { taskId, outputFile } = parseImmediateBashResult(text);
        if (outputFile) task.outputFile = outputFile;
        if (taskId) task.taskId = task.taskId ?? taskId;
        continue;
      }

      if (task.transcriptDir) continue;
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
    // A task the tracker still calls live may have ended while nobody was
    // listening — its log says so even when no notification ever arrived.
    if (task.status === 'running' && task.outputFile) {
      const settled = readTerminalMarker(task.outputFile);
      if (settled) task.status = settled;
    }
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
        this.onTaskNotFound(sessionId, event);
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
    if (taskType === 'local_workflow' || taskType === 'local_bash' || taskType === 'local_agent') t.taskType = taskType;
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
        // Skip pure placeholder deltas with no identity yet (no id and no label).
        if (!str(a['agentId']) && !str(a['label'])) continue;
        const index = num(a['index']);
        const slot = String(index);
        const prev = entry.agents.get(slot)?.agent;
        // Spread the CLI's entry as-is: every field it sends reaches the webview
        // under the CLI's own name, including ones nothing renders yet (model,
        // promptPreview, attempt, error…). Deltas are partial, so merging over
        // the previous state is what keeps earlier fields alive — but the merge
        // must never invent or rename a field (CLAUDE.md: no renaming, no
        // dropping). `agentId` is the one value the webview needs as a key, so
        // it falls back to the slot while the CLI has not assigned one yet.
        const agent: WorkflowAgent = { ...prev, ...a, agentId: str(a['agentId']) ?? prev?.agentId ?? slot };
        entry.agents.set(slot, { order: index, agent });
      }
      t.agents = [...entry.agents.values()].sort((x, y) => x.order - y.order).map((v) => v.agent);
    }

    // Live workflow-level usage, carried through as the CLI sent it. Picking
    // two of its fields out and renaming them lost whatever else it reports,
    // and made the same figure read as `total_tokens` here and something else
    // downstream. The agent count belongs to the agent list, not in here.
    const usage = event['usage'] as Record<string, unknown> | undefined;
    if (usage) t.usage = { ...usage };
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
    if (typeof event['summary'] === 'string') t.summary = event['summary'] as string;
    if (typeof event['task_id'] === 'string') t.taskId = event['task_id'] as string;

    const outputFile = typeof event['output_file'] === 'string' ? (event['output_file'] as string) : undefined;
    if (outputFile) {
      t.outputFile = outputFile;
      // Only a dynamic workflow's output file is the JSON envelope
      // readOutputFile expects ({summary, result}). A plain background Bash
      // task's output file is its raw stdout/stderr log (issue #347), and a
      // backgrounded Agent/Task's is its own JSONL transcript (issue #383) —
      // neither is that envelope. Both already got summary/status from this
      // event, and their "result" is the file itself, read separately by
      // GET_BACKGROUND_TASK_OUTPUT on demand.
      if (t.taskType === 'local_workflow') {
        const parsed = readOutputFile(outputFile);
        if (parsed.summary && !event['summary']) t.summary = parsed.summary;
        if (parsed.result !== undefined) t.result = parsed.result;
      }
    }

    const usage = event['usage'] as Record<string, unknown> | undefined;
    if (usage) t.usage = { ...usage };
    // Same as the reload path: whatever else the event said, kept under the
    // CLI's own names rather than discarded for not being on a known list.
    // The envelope's `note` shows up here as the event's own equivalent.
    const rest = { ...event };
    for (const known of [
      'type', 'subtype', 'session_id', 'uuid', 'tool_use_id',
      'task_id', 'status', 'summary', 'output_file', 'usage',
    ]) {
      delete rest[known];
    }
    if (Object.keys(rest).length > 0) t.notification = rest;
    t.endedAt = Date.now();
    this.broadcast(entry);
    this.snapshotAgents(t);
  }

  /**
   * Write down the CLI's per-agent entries now that the workflow is over and
   * they carry everything it ever reported. Nothing persists them otherwise, so
   * this is what lets a reopened tab show agent names instead of ids.
   */
  private snapshotAgents(task: WorkflowTask): void {
    if (!task.workflowId || task.agents.length === 0) return;
    void saveWorkflowAgentSnapshot(task.workflowId, task.agents);
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

      if (entry.task.taskType === 'local_agent') {
        // A backgrounded Agent/Task call has no transcriptDir/agents either —
        // it is one agent, not a workflow of many. Its taskId already arrived
        // on task_started; only the output file (its own JSONL transcript) is
        // new here (#383).
        if (entry.task.outputFile) continue;
        const { outputFile } = parseImmediateAgentResult(text);
        if (!outputFile) continue;
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

  /**
   * Settle any tracked task whose task_id the CLI just declared unknown (see
   * {@link parseTaskNotFoundId}) — e.g. a cancel click that resolved into the
   * TaskStop reminder fallback, which then found nothing to stop. Without
   * this, such a task stays 'running' forever: no terminal task_notification
   * is ever coming for a task the CLI itself has already forgotten, and the
   * panel keeps ticking its token/duration counters on a corpse.
   */
  private onTaskNotFound(sessionId: string, event: Record<string, unknown>): void {
    for (const block of getContentBlocks(event)) {
      if (block['type'] !== 'tool_result') continue;
      const content = block['content'];
      const text = typeof content === 'string' ? content : getEventText(event);
      const deadTaskId = parseTaskNotFoundId(text);
      if (!deadTaskId) continue;
      for (const entry of this.entries.values()) {
        if (entry.sessionId === sessionId && entry.task.taskId === deadTaskId) {
          this.settleStopped(entry);
        }
      }
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
    t.usage = { ...t.usage, durationMs: t.usage?.durationMs ?? t.endedAt - t.startedAt };
    this.broadcast(entry);
    // An interrupted workflow is just as worth naming on reload as a finished
    // one — arguably more, since the reader is probably coming back to it.
    this.snapshotAgents(t);
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

  /**
   * Settle a task the CLI never sent a notification for, using the terminal
   * line its own output log carries.
   *
   * Called when that log changes, so a task whose process was killed stops
   * claiming to be running the moment the CLI writes `[killed]` into it,
   * rather than at the next reload — or never, if the session stays open.
   */
  settleByOutputFile(outputFile: string): void {
    for (const entry of this.entries.values()) {
      const t = entry.task;
      if (t.status !== 'running' || t.outputFile !== outputFile) continue;
      const settled = readTerminalMarker(outputFile);
      if (!settled) continue;
      t.status = settled;
      // `endedAt` is the whole record of this: a task settled from its log got
      // no usage from the CLI, and a duration we worked out from our own clock
      // is not something the CLI reported. The webview derives it from
      // endedAt/startedAt when the CLI gave no `duration_ms`.
      t.endedAt = Date.now();
      this.broadcast(entry);
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

/**
 * The one tracker for this process, shared by the CLI stream (which creates it)
 * and the output-log watcher (which only settles tasks through it). It lives
 * here rather than beside the stream so the watcher can reach it without
 * importing the CLI process module, which would close an import cycle.
 */
let sharedTracker: WorkflowProgressTracker | null = null;

export function getWorkflowTracker(connections: ConnectionManager): WorkflowProgressTracker {
  if (!sharedTracker) sharedTracker = WorkflowProgressTracker.create(connections);
  return sharedTracker;
}

/** The tracker if one has been created; the watcher must not create one. */
export function peekWorkflowTracker(): WorkflowProgressTracker | null {
  return sharedTracker;
}

/** Read a workflow task `.output` JSON file for its summary + result (best-effort). */
/**
 * The CLI closes a background task's output log with its own terminal line —
 * `[exited with code N]` or `[killed]`. That line is the only word we get when
 * the task's owning CLI dies without ever emitting a `task_notification`, which
 * is exactly what happens to a backgrounded command whose process is killed:
 * the tracker keeps a live entry saying `running`, and nothing ever contradicts
 * it. Four such tasks sat at "running" for seven hours with `[killed]` written
 * in their logs the whole time.
 *
 * Read from the tail, since the marker is the last thing in the file.
 */
function readTerminalMarker(path: string): WorkflowStatus | undefined {
  try {
    if (!existsSync(path)) return undefined;
    const tail = readFileSync(path, 'utf-8').trimEnd().split('\n').pop() ?? '';
    if (/^\[killed\]$/.test(tail.trim())) return 'stopped';
    const exited = tail.trim().match(/^\[exited with code (\d+)\]$/);
    if (exited) return exited[1] === '0' ? 'completed' : 'failed';
    return undefined;
  } catch {
    return undefined;
  }
}

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
