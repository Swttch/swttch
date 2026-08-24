// Shared dynamic-workflow types. MUST stay 1:1 with webview/src/shared/workflow.ts
// (see CLAUDE.md). Payload of MessageType.WORKFLOW_PROGRESS (backend → webview).

export type WorkflowStatus = 'running' | 'completed' | 'failed' | 'stopped';

/** A declared phase from the workflow script's `meta.phases`. */
export interface WorkflowPhase {
  title: string;
  detail?: string;
}

/**
 * One subagent of a workflow. Stats are computed by the backend from the agent
 * transcript files; `label` is best-effort (derived from the agent's result) as
 * the runtime does not persist the script-supplied label.
 */
export interface WorkflowAgent {
  agentId: string;
  label: string;
  /** `done` = finished successfully; `stopped` = cut off when the workflow was
   *  interrupted (never settle an unfinished agent to `done`). */
  status: 'running' | 'done' | 'stopped';
  tokens: number;
  tools: number;
  durationMs: number;
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
 * (`local_workflow`, has agents/phases/transcriptDir) or a plain background
 * Bash command (`local_bash`, has only an output log — no agents). The
 * Background tasks panel shows both under one list; the detail view branches
 * on this to show agent transcripts vs. the raw output log (issue #347).
 */
export type BackgroundTaskType = 'local_workflow' | 'local_bash';

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
