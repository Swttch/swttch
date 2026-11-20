import { getTextContent, type LoadedMessageDto } from '../../../types';
import { parseWorkflowNotification } from '../message-renderers/utils/parseWorkflowNotification';

/** What a background task was, in the word the line says it with ("Background agent completed"). */
export type TaskNoticeNoun = 'agent' | 'command' | 'workflow' | 'task';
export type TaskNoticeStatus = 'completed' | 'failed' | 'stopped';

export interface TaskNotice {
  noun: TaskNoticeNoun;
  status: TaskNoticeStatus;
  /** What the line names: the task's own description, or the CLI's whole summary when the summary is not in a known shape. */
  detail: string;
  /** Why a task failed, when the summary says. */
  reason: string | null;
  /** How long the task took, when the notice carries it. */
  durationMs: number | null;
  /** The call that started the task, which is what the background tasks panel knows the task by. */
  toolUseId: string | null;
  /**
   * The task's own id (an agent's is its agent id). The same agent notifies again each time a message resumes it, and
   * those notices carry the id of the call that resumed it, not the one that started it: this is what still names it.
   */
  taskId: string | null;
}

/**
 * The shapes the CLI writes a task's summary in ("Agent "final check" finished", "Background command "x" completed
 * (exit code 0)"): the kind of task, the description in quotes, then what happened. The desktop app reads the same
 * text with the same pattern, so the description is whatever is inside the first quotes that is not followed by a
 * failure's reason.
 */
const SUMMARY =
  /^(Agent|Background agent|Dynamic workflow|Background workflow|Workflow|Background command|Monitor|Remote task|Task) "((?:(?!" (?:(?:failed|was stopped|is blocked):|from the previous session|was checkpointed) ).)+)" (?:completed|finished|failed|was|stopped|stream|script|appears|ended|is blocked|(?:\(run [^\s)"]+\) )?didn't finish before|from the previous session)/;

const NOUN_OF: Record<string, TaskNoticeNoun> = {
  Agent: 'agent',
  'Background agent': 'agent',
  'Dynamic workflow': 'workflow',
  'Background workflow': 'workflow',
  Workflow: 'workflow',
  'Background command': 'command',
  Monitor: 'command',
  'Remote task': 'task',
  Task: 'task',
};

/** The CLI's own words for how a task ended, as the three the line tells apart. */
function statusOf(raw: string | undefined): TaskNoticeStatus {
  switch (raw) {
    case 'failed':
    case 'blocked':
    case 'cancelled':
      return 'failed';
    case 'stopped':
    case 'killed':
      return 'stopped';
    default:
      return 'completed';
  }
}

/**
 * The text of the notice an entry carries. The CLI writes it one of two ways: as a user entry of its own, or, when
 * it arrives while Claude is in the middle of a turn, as an `attachment` entry that queued it.
 */
function noticeTextOf(message: LoadedMessageDto): string | null {
  if (message.type === 'user' && message.origin?.kind === 'task-notification') return getTextContent(message);
  const attachment = (message as unknown as { attachment?: { type?: string; prompt?: unknown } }).attachment;
  if ((message.type as string) === 'attachment' && attachment?.type === 'queued_command' && typeof attachment.prompt === 'string') {
    return attachment.prompt.includes('<task-notification>') ? attachment.prompt : null;
  }
  return null;
}

/**
 * Whether the entry is the CLI telling Claude that a background task is over. A command that completed and
 * arrived mid-turn is not drawn as a line: it is counted in the line over the run it arrives in (`backgroundDoneOf`).
 */
export function isTaskNoticeEntry(message: LoadedMessageDto): boolean {
  const text = noticeTextOf(message);
  if (text === null) return false;
  if (message.type === 'user') return true;
  return !(/<status>completed<\/status>/.test(text) && /<summary>\s*Background command/.test(text));
}

/** The notice an entry carries, or null when it is not one (or says nothing of how the task ended). */
export function taskNoticeOf(message: LoadedMessageDto): TaskNotice | null {
  if (!isTaskNoticeEntry(message)) return null;
  const notification = parseWorkflowNotification(noticeTextOf(message) ?? '');
  if (!notification) return null;

  const status = statusOf(notification.status);
  const summary = (notification.summary ?? '').trim();
  const match = SUMMARY.exec(summary);
  const noun = match ? (NOUN_OF[match[1]] ?? 'task') : 'task';
  const description = match ? match[2] : null;

  let reason: string | null = null;
  if (status === 'failed' && description) {
    const after = summary.slice(summary.indexOf(`"${description}" `) + description.length + 3);
    const first = after.replace(/^failed(?:: | with |$)/, '').split('\n', 1)[0].replace(/\.$/, '').trim();
    reason = first === '' ? null : first;
  }

  const duration = notification.usage?.['duration_ms'];
  return {
    noun,
    status,
    detail: description ?? summary,
    reason,
    durationMs: typeof duration === 'number' && Number.isFinite(duration) ? duration : null,
    toolUseId: notification.toolUseId ?? null,
    taskId: notification.taskId ?? null,
  };
}
