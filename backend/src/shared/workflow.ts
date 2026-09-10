// Shared dynamic-workflow types. MUST stay 1:1 with webview/src/shared/workflow.ts
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

/** Aggregate usage, populated from the final `<task-notification>` `<usage>`. */
export interface WorkflowUsage {
  agentCount?: number;
  subagentTokens?: number;
  toolUses?: number;
  durationMs?: number;
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
}
