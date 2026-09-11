// Shared dynamic-workflow types. MUST stay 1:1 with backend/src/shared/workflow.ts
// (see CLAUDE.md). Payload of MessageType.WORKFLOW_PROGRESS (backend → webview).

export type WorkflowStatus = 'running' | 'completed' | 'failed' | 'stopped';

/** A declared phase from the workflow script's `meta.phases`. */
export interface WorkflowPhase {
  title: string;
  detail?: string;
}

/**
 * One subagent of a workflow, carried through **verbatim**: this is the CLI's
 * own `task_progress.workflow_progress[]` entry, under the CLI's own field
 * names, with nothing dropped or renamed on the way to the webview (see the
 * original-data-preservation rule in CLAUDE.md).
 *
 * Every field is optional because the CLI fills them in as the agent
 * progresses, not because they are unreliable. A first delta carries only
 * `type`/`index`/`title`; `label`, `model` and `promptPreview` arrive with
 * `state: 'start'`; `agentId`, `startedAt` and `attempt` once a slot is
 * actually running; `tokens`/`toolCalls` at `state: 'progress'`; `error` and
 * `durationMs` only at the end. So an absent field means "not yet", never
 * "none" — do not render an absence as a value.
 *
 * The backend merges successive deltas per slot, so what reaches the webview
 * is the union of everything seen so far for that agent.
 */
export interface WorkflowAgent {
  /** Always `'workflow_agent'` on real agent entries. */
  type?: string;
  /** Global slot number, stable across retries (the backend's merge key). */
  index?: number;
  /** Set on phase-header entries, which carry no agent identity. */
  title?: string;
  /** The name the workflow script passed as `label`. */
  label?: string;
  phaseIndex?: number;
  phaseTitle?: string;
  /** Runtime instance id; changes when a slot is retried. */
  agentId?: string;
  /** e.g. `claude-haiku-4-5-20251001`. */
  model?: string;
  /** CLI's own lifecycle value: `start`, `progress`, `error`, `done`, … */
  state?: string;
  queuedAt?: number;
  startedAt?: number;
  lastProgressAt?: number;
  /** Retry counter, 1 on the first run. */
  attempt?: number;
  /** Opening of the prompt this agent was given. */
  promptPreview?: string;
  tokens?: number;
  toolCalls?: number;
  durationMs?: number;
  error?: unknown;
  /** Opening of what the agent returned. Arrives only once it has finished. */
  resultPreview?: string;
  /** The agent's return value as journal.jsonl recorded it (reload path only). */
  result?: unknown;

  /**
   * True when this agent was rebuilt from disk after a reload rather than seen
   * live. The CLI persists none of the fields above, so a rebuilt agent has
   * only `agentId` plus figures the backend recomputed from the transcript;
   * `label`, `model` and the rest are genuinely unknown, not empty.
   */
  reconstructed?: boolean;

  /** Anything the CLI starts sending that this interface has not caught up to. */
  [key: string]: unknown;
}

/**
 * Aggregate usage, under the CLI's own field names.
 *
 * The CLI names the same figures differently depending on which way it is
 * telling us, and both names are kept as sent rather than flattened into one
 * of our own (see the original-data-preservation rule in CLAUDE.md):
 *
 * - live `task_progress` / `task_notification` JSON events send
 *   `{total_tokens, tool_uses, duration_ms}` and no agent count;
 * - the `<task-notification>` envelope that survives in the transcript sends
 *   `<subagent_tokens>`, `<tool_uses>`, `<duration_ms>` and `<agent_count>`.
 *
 * So `total_tokens` and `subagent_tokens` are the same quantity arriving by
 * different routes, and which one is present says which route it came by. Use
 * `workflowTokens()` rather than reaching for either directly.
 *
 * Nothing here is computed by us: an agent count we worked out from the agent
 * list, or a duration we worked out from our own clock, is not something the
 * CLI said and does not belong in this object.
 */
export interface WorkflowUsage {
  total_tokens?: number;
  subagent_tokens?: number;
  tool_uses?: number;
  duration_ms?: number;
  agent_count?: number;
  /** Anything the CLI starts sending that this interface has not caught up to. */
  [key: string]: unknown;
}

/**
 * CLI's `task_type` for a background task: a dynamic Workflow-tool run
 * (`local_workflow`, has agents/phases/transcriptDir), a plain background
 * Bash command (`local_bash`, has only an output log — no agents), or a
 * single backgrounded Agent/Task call (`local_agent`, has an output file
 * that is its own JSONL transcript — also no agents array, since it is one
 * agent rather than a workflow of many). The Background tasks panel shows
 * all three under one list; the detail view branches on this to show agent
 * transcripts vs. the raw output log (issue #347, extended for #383).
 */
export type BackgroundTaskType = 'local_workflow' | 'local_bash' | 'local_agent';

/** Live + final state of a single background task (dynamic workflow or plain Bash). */
export interface WorkflowTask {
  /** Workflow tool_use id — the stable key correlating card, panel and events. */
  toolUseId: string;
  /** Background task id (e.g. "w94mspihl") from the immediate tool_result. */
  taskId?: string;
  /** CLI's task_type; undefined for tasks reconstructed before this field existed. */
  taskType?: BackgroundTaskType;
  /** Workflow run id (e.g. "wf_ce882bfa-ddf"), the transcript dir basename. */
  workflowId?: string;
  name: string;
  description?: string;
  /** Absolute path to …/subagents/workflows/wf_<id>. */
  transcriptDir?: string;
  /** Absolute path to the task output file (from the notification). */
  outputFile?: string;
  status: WorkflowStatus;
  startedAt: number;
  endedAt?: number;
  phases: WorkflowPhase[];
  agents: WorkflowAgent[];
  summary?: string;
  /** Workflow return value (raw `<result>` text). */
  result?: string;
  usage?: WorkflowUsage;
  /**
   * Every event the CLI sent about this task, kept whole.
   *
   * The fields above are conveniences read off these — a name to show, a
   * status to colour — and each one is a decision about what mattered at the
   * time. This is the record those decisions were made from, so a field
   * nothing reads yet is still here to be read later, and anything the CLI
   * starts sending arrives without a change on this side (see the
   * original-data-preservation rule in CLAUDE.md).
   */
  events?: WorkflowTaskEvents;
}

/**
 * The CLI's `task_*` events for one background task, under their own
 * `subtype` names and with nothing removed.
 *
 * `task_updated` is a list because each one carries a different `patch` and
 * they only make sense in order: one flips `is_backgrounded` to true when a
 * running command is sent to the background, and a later one closes the task
 * with `{status, end_time}`.
 *
 * `task_progress` keeps only the newest, because they are deltas whose merge
 * is what `agents` and `usage` already hold — the range-splitting allowance in
 * CLAUDE.md, not a licence to drop fields from the one that is kept.
 *
 * On reload there are no events to keep: the CLI persists none of them. What
 * stands in for `task_notification` there is the `<task-notification>`
 * envelope from the transcript, every tag of it, plus its `raw` text.
 */
export interface WorkflowTaskEvents {
  /**
   * Every `task_started` for this task, oldest first.
   *
   * A list because a resumed agent gets another one: the CLI fires a fresh
   * `task_started` under a NEW `tool_use_id` but the SAME `task_id`, and its
   * `prompt` is the message that resumed it rather than the one it was
   * launched with. So `[0]` is what the task was asked to do, and the rest are
   * what has been said to it since.
   */
  task_started?: Array<Record<string, unknown>>;
  task_progress?: Record<string, unknown>;
  task_updated?: Array<Record<string, unknown>>;
  task_notification?: Record<string, unknown>;
  /**
   * The `tool_use` block that started the task, whole.
   *
   * Not a `task_*` event, and the only place some of what was asked for is
   * ever stated: `task_started` reports no `model`, so an Agent launched with
   * one can only be known to have run on it from here.
   */
  tool_use?: Record<string, unknown>;
}
