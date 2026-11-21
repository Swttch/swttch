import { toInstance } from '@/dto/common';
import { LoadedMessageDto } from '@/types';
import type { WorkflowTask } from '@/shared';
import { isTaskNoticeEntry, taskNoticeOf } from './transcript/taskNotice';

/** The CLI's own word for what a task was, as its summary says it ("Agent "x" completed"). */
function kindWord(task: WorkflowTask): string {
  // The CLI writes a stop of anything but an agent as a "Task" ("Task "x" was stopped by the user"), as the record shows.
  if (task.status === 'stopped' && task.taskType !== 'local_agent') return 'Task';
  switch (task.taskType) {
    case 'local_agent':
      return 'Agent';
    case 'local_bash':
      return 'Background command';
    default:
      return 'Workflow';
  }
}

/** The notice the CLI will write for an ended task, built from what the screen heard, in the shape it writes it. */
function noticeOf(task: WorkflowTask): LoadedMessageDto {
  const description = (task.description ?? task.name).replace(/"/g, "'");
  const duration = task.endedAt !== undefined ? Math.max(0, task.endedAt - task.startedAt) : undefined;
  const summary = `${kindWord(task)} "${description}" ${task.status === 'failed' ? 'failed' : task.status === 'stopped' ? 'was stopped' : 'completed'}`;
  const usage = duration !== undefined ? `\n<usage><duration_ms>${duration}</duration_ms></usage>` : '';
  return toInstance(LoadedMessageDto, {
    type: 'user',
    uuid: `live-task-notice-${task.toolUseId}`,
    timestamp: task.endedAt !== undefined ? new Date(task.endedAt).toISOString() : undefined,
    origin: { kind: 'task-notification' },
    message: {
      role: 'user',
      content: `<task-notification>\n<task-id>${task.taskId ?? ''}</task-id>\n<tool-use-id>${task.toolUseId}</tool-use-id>\n<status>${task.status}</status>\n<summary>${summary}</summary>${usage}\n</task-notification>`,
    },
  });
}

/**
 * The messages with the notice of each task whose end was seen happen, where it arrived. The CLI writes that notice
 * into the session only later (it is read back after a reload), so until then the desktop app's line has to be
 * drawn from what the screen heard. A task whose notice is already among the messages gets no second one.
 */
export function withLiveTaskNotices(
  messages: LoadedMessageDto[],
  tasks: WorkflowTask[],
  liveEndedIds: ReadonlySet<string> | undefined,
): LoadedMessageDto[] {
  messages = placedByTime(messages);
  if (!liveEndedIds || liveEndedIds.size === 0) return messages;
  const present = new Set<string>();
  for (const message of messages) {
    if (isTaskNoticeEntry(message)) {
      const id = taskNoticeOf(message)?.toolUseId;
      if (id) present.add(id);
    }
  }
  const missing = tasks.filter((t) => liveEndedIds.has(t.toolUseId) && t.status !== 'running' && !present.has(t.toolUseId));
  if (missing.length === 0) return messages;

  const result = [...messages];
  for (const task of [...missing].sort((a, b) => (a.endedAt ?? 0) - (b.endedAt ?? 0))) {
    const notice = noticeOf(task);
    const at = task.endedAt;
    // Before the first message that is later than the end, as the record will have it; at the end when none is.
    let index = result.length;
    if (at !== undefined) {
      const later = result.findIndex((m) => m.timestamp !== undefined && Date.parse(m.timestamp) > at);
      if (later !== -1) index = later;
    }
    result.splice(index, 0, notice);
  }
  return result;
}

/**
 * A notice that reached Claude in the middle of a turn is written into the session after the message that was
 * sent meanwhile, but with the time it really arrived. The desktop app draws it where that time falls, so a notice
 * written after a later send is moved to before the first message that is later than it.
 */
export function placedByTime(messages: LoadedMessageDto[]): LoadedMessageDto[] {
  const late = (m: LoadedMessageDto, at: number) => m.timestamp !== undefined && Date.parse(m.timestamp) > at;
  let result = messages;
  messages.forEach((notice) => {
    if ((notice.type as string) !== 'attachment' || !isTaskNoticeEntry(notice) || notice.timestamp === undefined) return;
    const at = Date.parse(notice.timestamp);
    const current = result.indexOf(notice);
    // Only the first message after it in the record that is later than it decides: nothing moves unless one is.
    const target = result.findIndex((m, i) => i < current && late(m, at));
    if (target === -1) return;
    result = [...result.slice(0, target), notice, ...result.slice(target, current), ...result.slice(current + 1)];
  });
  return result;
}
