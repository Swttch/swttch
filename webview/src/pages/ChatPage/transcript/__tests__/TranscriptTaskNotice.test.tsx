import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { toInstance } from '@/dto/common';
import { LoadedMessageDto } from '@/types';
import { isUserSend } from '../../paging';

// The line leads to the background tasks panel, so the shared state is stubbed; what is asked of it is the open call.
let tracked: Record<string, object> = {};
let provided = true;
const openPanel = vi.fn();
vi.mock('@/contexts/WorkflowStateContext', () => ({
  useOptionalWorkflowState: () => (provided ? { getByToolUseId: (id: string) => tracked[id], tasks: Object.values(tracked), openPanel } : null),
}));

import { TranscriptTaskNotice } from '../TranscriptTaskNotice';

function notice(summary: string, status = 'completed', durationMs: number | null = 78000, toolUseId = 'u1') {
  const usage = durationMs === null ? '' : `<usage><duration_ms>${durationMs}</duration_ms></usage>`;
  return toInstance(LoadedMessageDto, {
    type: 'user',
    uuid: 'n1',
    origin: { kind: 'task-notification' },
    message: {
      role: 'user',
      content: `<task-notification>\n<task-id>t1</task-id>\n<tool-use-id>${toolUseId}</tool-use-id>\n<status>${status}</status>\n<summary>${summary}</summary>\n${usage}\n</task-notification>`,
    },
  });
}

beforeEach(() => {
  tracked = { u1: { toolUseId: 'u1', taskId: 't1' } };
  provided = true;
  openPanel.mockClear();
});

describe('TranscriptTaskNotice', () => {
  it('says what ended and, after a dot, for how long, on one line, as the desktop app does', () => {
    const { container } = render(<TranscriptTaskNotice message={notice('Agent "final check" finished')} />);
    const line = container.querySelector('[data-transcript-task-notice]');
    expect(line?.textContent).toBe('Background agent completed · final check · took 1m 18s');
  });

  it('names a task that failed with its reason, without saying it completed', () => {
    const { container } = render(<TranscriptTaskNotice message={notice('Agent "build it" failed: Prompt is too long', 'failed', null)} />);
    const line = container.querySelector('[data-transcript-task-notice="failed"]');
    expect(line?.textContent).toBe('Background agent failed · build it: Prompt is too long');
    // Only the sentence is red; the description and reason stay quiet.
    expect(line?.querySelector('.text-state-error-fg')?.textContent).toBe('Background agent failed');
  });

  it('says a task that was stopped by what it was, with no time', () => {
    const agent = render(<TranscriptTaskNotice message={notice('Agent "stop agent" was stopped by user', 'killed')} />);
    expect(agent.container.querySelector('[data-transcript-task-notice="stopped"]')?.textContent).toBe('Background agent stopped · stop agent');
    agent.unmount();
    const task = render(<TranscriptTaskNotice message={notice('Task "stop me" was stopped by the user or by the app', 'killed')} />);
    expect(task.container.querySelector('[data-transcript-task-notice="stopped"]')?.textContent).toBe('Background task stopped · stop me');
  });

  it('says a command that completed as a sentence, with no time', () => {
    const { container } = render(<TranscriptTaskNotice message={notice('Background command "Print ticks" completed (exit code 0)', 'completed', 78000)} />);
    expect(container.querySelector('[data-transcript-task-notice="completed"]')?.textContent).toBe('Background command completed · Print ticks');
  });

  it('draws nothing for an entry that is not a task notice', () => {
    const plain = toInstance(LoadedMessageDto, { type: 'user', uuid: 'p', message: { role: 'user', content: 'hi' } });
    const { container } = render(<TranscriptTaskNotice message={plain} />);
    expect(container.firstChild).toBeNull();
  });

  describe('as a way into the background tasks panel', () => {
    it('opens the panel on its own task when clicked, as the desktop app does', () => {
      tracked = {};
      const { container } = render(<TranscriptTaskNotice message={notice('Agent "final check" finished', 'completed', 78000, 'toolu_77')} />);
      tracked = { toolu_77: { toolUseId: 'toolu_77', taskId: 'other' } };
      const { container: again } = render(<TranscriptTaskNotice message={notice('Agent "final check" finished', 'completed', 78000, 'toolu_77')} />);

      const line = again.querySelector('[data-transcript-task-notice]') as HTMLElement;
      expect(line.tagName).toBe('BUTTON');
      fireEvent.click(line);
      expect(openPanel).toHaveBeenCalledWith('toolu_77');
      // The one drawn before the task was known is not a button: there is nothing to open.
      expect((container.querySelector('[data-transcript-task-notice]') as HTMLElement).tagName).not.toBe('BUTTON');
    });

    it('is plain text when the app does not track the task, or when there is no provider', () => {
      tracked = {};
      const unknown = render(<TranscriptTaskNotice message={notice('Agent "x" finished')} />);
      expect((unknown.container.querySelector('[data-transcript-task-notice]') as HTMLElement).tagName).not.toBe('BUTTON');

      provided = false;
      tracked = { u1: { toolUseId: 'u1', taskId: 't1' } };
      const none = render(<TranscriptTaskNotice message={notice('Agent "x" finished')} />);
      expect((none.container.querySelector('[data-transcript-task-notice]') as HTMLElement).tagName).not.toBe('BUTTON');
    });

    it('finds a resumed agent by its own id, when the notice names the call that resumed it', () => {
      // The same agent notifies again each time a message resumes it, with the id of that message's call.
      const { container } = render(<TranscriptTaskNotice message={notice('Agent "x" finished', 'completed', 78000, 'toolu_resume')} />);
      const line = container.querySelector('[data-transcript-task-notice]') as HTMLElement;
      expect(line.tagName).toBe('BUTTON');
      fireEvent.click(line);
      expect(openPanel).toHaveBeenCalledWith('u1');
    });

    it('is clickable for a failed task too', () => {
      const { container } = render(<TranscriptTaskNotice message={notice('Agent "x" failed: boom', 'failed', null)} />);
      fireEvent.click(container.querySelector('[data-transcript-task-notice="failed"]') as HTMLElement);
      expect(openPanel).toHaveBeenCalledWith('u1');
    });
  });
});

describe('isUserSend and a task notice', () => {
  it('is not something the user sent, so it opens no section and re-arms nothing', () => {
    expect(isUserSend(notice('Agent "x" finished'))).toBe(false);
    const typed = toInstance(LoadedMessageDto, { type: 'user', uuid: 'p', message: { role: 'user', content: 'hi' } });
    expect(isUserSend(typed)).toBe(true);
  });
});
