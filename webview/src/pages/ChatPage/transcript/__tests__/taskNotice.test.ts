import { describe, it, expect } from 'vitest';
import { toInstance } from '@/dto/common';
import { LoadedMessageDto } from '@/types';
import { isTaskNoticeEntry, taskNoticeOf } from '../taskNotice';

function notice(summary: string, status = 'completed', usage = '<usage><duration_ms>78000</duration_ms></usage>') {
  return toInstance(LoadedMessageDto, {
    type: 'user',
    uuid: 'n1',
    origin: { kind: 'task-notification' },
    message: {
      role: 'user',
      content: `<task-notification>\n<task-id>t1</task-id>\n<tool-use-id>u1</tool-use-id>\n<status>${status}</status>\n<summary>${summary}</summary>\n${usage}\n</task-notification>`,
    },
  });
}

describe('taskNoticeOf', () => {
  it('reads an agent that finished: its kind, its description and how long it took', () => {
    expect(taskNoticeOf(notice('Agent "final check" finished'))).toEqual({
      noun: 'agent',
      status: 'completed',
      detail: 'final check',
      reason: null,
      durationMs: 78000,
      toolUseId: 'u1',
    });
  });

  it('reads a command and a workflow by the words the CLI summarises them in', () => {
    expect(taskNoticeOf(notice('Background command "Print six ticks" completed (exit code 0)'))).toMatchObject({ noun: 'command', detail: 'Print six ticks' });
    expect(taskNoticeOf(notice('Dynamic workflow "Tiny workflow" completed'))).toMatchObject({ noun: 'workflow', detail: 'Tiny workflow' });
  });

  it('tells a task that failed, with the reason the summary gives', () => {
    const n = taskNoticeOf(notice('Agent "build it" failed: Prompt is too long', 'failed'));
    expect(n).toMatchObject({ noun: 'agent', status: 'failed', detail: 'build it', reason: 'Prompt is too long' });
  });

  it('takes killed for stopped, and anything unknown for completed', () => {
    expect(taskNoticeOf(notice('Agent "x" was stopped', 'killed'))?.status).toBe('stopped');
    expect(taskNoticeOf(notice('Agent "x" finished', 'something-new'))?.status).toBe('completed');
  });

  it('falls back to the whole summary for a shape it does not know', () => {
    expect(taskNoticeOf(notice('Something else happened'))).toMatchObject({ noun: 'task', detail: 'Something else happened' });
  });

  it('has no duration when the notice carries none', () => {
    expect(taskNoticeOf(notice('Agent "x" finished', 'completed', ''))?.durationMs).toBeNull();
  });

  it('is only for an entry the CLI marks as a task notification', () => {
    const plain = toInstance(LoadedMessageDto, { type: 'user', uuid: 'p', message: { role: 'user', content: 'hi' } });
    expect(isTaskNoticeEntry(plain)).toBe(false);
    expect(taskNoticeOf(plain)).toBeNull();
    expect(isTaskNoticeEntry(notice('Agent "x" finished'))).toBe(true);
  });
});
