import { describe, it, expect } from 'vitest';
import { toInstance } from '@/dto/common';
import { LoadedMessageDto } from '@/types';
import type { WorkflowTask } from '@/shared';
import { placedByTime, withLiveTaskNotices } from '../liveTaskNotices';
import { taskNoticeOf, isTaskNoticeEntry } from '../transcript/taskNotice';

const task = (over: Partial<WorkflowTask> = {}): WorkflowTask =>
  ({ toolUseId: 'u1', name: 'final check', description: 'final check', taskType: 'local_agent', status: 'completed', startedAt: 1000, endedAt: 79000, phases: [], agents: [], ...over }) as WorkflowTask;

const msg = (uuid: string, timestamp: string) =>
  toInstance(LoadedMessageDto, { type: 'assistant', uuid, timestamp, message: { role: 'assistant', content: 'hi' } });

describe('withLiveTaskNotices', () => {
  it('adds the notice of a task whose end was seen, with how long it took', () => {
    const out = withLiveTaskNotices([msg('a', new Date(2000).toISOString())], [task()], new Set(['u1']));
    const added = out.find(isTaskNoticeEntry)!;
    expect(taskNoticeOf(added)).toMatchObject({ noun: 'agent', status: 'completed', detail: 'final check', durationMs: 78000, toolUseId: 'u1' });
  });

  it('places it before the first message that came after the end, and at the end when none did', () => {
    const early = msg('a', new Date(2000).toISOString());
    const late = msg('b', new Date(90000).toISOString());
    expect(withLiveTaskNotices([early, late], [task()], new Set(['u1'])).map((m) => m.uuid)).toEqual(['a', 'live-task-notice-u1', 'b']);
    expect(withLiveTaskNotices([early], [task()], new Set(['u1'])).map((m) => m.uuid)).toEqual(['a', 'live-task-notice-u1']);
  });

  it('adds nothing for a task read back already over, a running one, or one whose own notice is there', () => {
    const own = toInstance(LoadedMessageDto, {
      type: 'user',
      uuid: 'n',
      origin: { kind: 'task-notification' },
      message: { role: 'user', content: '<task-notification>\n<tool-use-id>u1</tool-use-id>\n<status>completed</status>\n<summary>Agent "final check" finished</summary>\n</task-notification>' },
    });
    const messages = [msg('a', new Date(2000).toISOString())];
    expect(withLiveTaskNotices(messages, [task()], new Set())).toBe(messages);
    expect(withLiveTaskNotices(messages, [task({ status: 'running' })], new Set(['u1']))).toBe(messages);
    expect(withLiveTaskNotices([own], [task()], new Set(['u1']))).toEqual([own]);
  });

  it('says a failure and a stop as the line does', () => {
    const failed = withLiveTaskNotices([], [task({ status: 'failed', taskType: 'local_bash', description: 'failing job' })], new Set(['u1']));
    expect(taskNoticeOf(failed[0])).toMatchObject({ noun: 'command', status: 'failed', detail: 'failing job' });
  });
});

describe('a stopped task seen live', () => {
  it('is said as the CLI says it: an agent by its kind, anything else as a task', () => {
    const workflow = withLiveTaskNotices([], [task({ status: 'stopped', taskType: 'local_workflow', description: 'a flow' })], new Set(['u1']));
    expect(taskNoticeOf(workflow[0])).toMatchObject({ noun: 'task', status: 'stopped', detail: 'a flow' });
    const agent = withLiveTaskNotices([], [task({ status: 'stopped', taskType: 'local_agent', description: 'an agent' })], new Set(['u1']));
    expect(taskNoticeOf(agent[0])).toMatchObject({ noun: 'agent', status: 'stopped' });
  });
});

describe('placedByTime', () => {
  it('moves a notice written after a later message back to where its own time falls', () => {
    const before = msg('a', new Date(1000).toISOString());
    const send = msg('send', new Date(9000).toISOString());
    const notice = toInstance(LoadedMessageDto, {
      type: 'attachment',
      uuid: 'n',
      timestamp: new Date(5000).toISOString(),
      attachment: { type: 'queued_command', prompt: '<task-notification>\n<tool-use-id>u1</tool-use-id>\n<status>killed</status>\n<summary>Task "stop me" was stopped by the user</summary>\n</task-notification>' },
    });
    expect(placedByTime([before, send, notice]).map((m) => m.uuid)).toEqual(['a', 'n', 'send']);
    expect(placedByTime([before, notice, send]).map((m) => m.uuid)).toEqual(['a', 'n', 'send']);
    expect(taskNoticeOf(notice)).toMatchObject({ status: 'stopped', detail: 'stop me', noun: 'task' });
  });
});
