import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import type { WorkflowTask } from '@/shared';

const sendRawMock = vi.fn();
const handlers = new Map<string, (message: { type: string; payload?: Record<string, unknown> }) => void>();
const unsubscribeMock = vi.fn();
const subscribeMock = vi.fn((type: string, handler: (message: { type: string; payload?: Record<string, unknown> }) => void) => {
  handlers.set(type, handler);
  return unsubscribeMock;
});

vi.mock('@/hooks/useBridge', () => ({
  useBridge: () => ({ sendRaw: sendRawMock, subscribe: subscribeMock }),
}));

// UserMessageRenderer (reused inside MessageBubble) reads useCliConfig(),
// which the real app provides via AppProviders — not present in this
// standalone render, same reason as AgentTranscriptModal/__tests__/index.test.tsx.
vi.mock('@/contexts/CliConfigContext', () => ({
  useCliConfig: () => ({ controlResponse: null, isLoading: false, refresh: vi.fn() }),
}));

import { AgentOutputTranscriptBody } from '../AgentOutputTranscriptBody';
import { MessageType } from '@/shared';

function makeTask(overrides: Partial<WorkflowTask> = {}): WorkflowTask {
  return {
    toolUseId: 'toolu_1',
    taskType: 'local_agent',
    name: 'Investigate the repo',
    status: 'running',
    startedAt: 0,
    phases: [],
    agents: [],
    ...overrides,
  };
}

function emitChange(outputFile: string, text: string, truncated = false) {
  const handler = handlers.get(MessageType.BACKGROUND_TASK_OUTPUT_CHANGED);
  handler?.({ type: MessageType.BACKGROUND_TASK_OUTPUT_CHANGED, payload: { outputFile, text, truncated } });
}

describe('AgentOutputTranscriptBody', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handlers.clear();
  });

  it('shows a starting state when the output file is not yet resolved', () => {
    render(<AgentOutputTranscriptBody task={makeTask()} outputFile={undefined} />);
    expect(screen.getByText('Starting task…')).toBeInTheDocument();
    expect(sendRawMock).not.toHaveBeenCalled();
  });

  it('parses pushed JSONL lines into chat bubbles instead of dumping raw text', () => {
    render(<AgentOutputTranscriptBody task={makeTask()} outputFile="/tmp/tasks/a1.output" />);

    const entry = { type: 'user', uuid: 'u1', message: { role: 'user', content: 'reading cart.js now' } };
    act(() => emitChange('/tmp/tasks/a1.output', `${JSON.stringify(entry)}\n`));

    expect(screen.getByText('reading cart.js now')).toBeInTheDocument();
    // The raw JSON — braces, quoted keys — must not appear verbatim anywhere.
    expect(screen.queryByText(/"type":"user"/)).not.toBeInTheDocument();
  });

  it('skips a malformed line (e.g. one truncated mid-line by the backend cap) without blanking the rest', () => {
    render(<AgentOutputTranscriptBody task={makeTask()} outputFile="/tmp/tasks/a1.output" />);

    const good = { type: 'user', uuid: 'u2', message: { role: 'user', content: 'second line is fine' } };
    const text = `{"type":"user","uuid":"u1","message":{"ro\n${JSON.stringify(good)}\n`;
    act(() => emitChange('/tmp/tasks/a1.output', text));

    expect(screen.getByText('second line is fine')).toBeInTheDocument();
  });

  it('shows the empty state once loaded with no parseable entries', () => {
    render(<AgentOutputTranscriptBody task={makeTask()} outputFile="/tmp/tasks/a1.output" />);

    act(() => emitChange('/tmp/tasks/a1.output', ''));

    expect(screen.getByText('No messages yet.')).toBeInTheDocument();
  });

  it('shows the streaming indicator below the transcript while the task is running', () => {
    render(<AgentOutputTranscriptBody task={makeTask({ status: 'running' })} outputFile="/tmp/tasks/a1.output" />);

    const entry = { type: 'user', uuid: 'u1', message: { role: 'user', content: 'still going' } };
    act(() => emitChange('/tmp/tasks/a1.output', `${JSON.stringify(entry)}\n`));

    expect(document.querySelector('.text-accent-primary')).toBeInTheDocument();
  });

  it('hides the streaming indicator once the task is no longer running', () => {
    render(<AgentOutputTranscriptBody task={makeTask({ status: 'completed' })} outputFile="/tmp/tasks/a1.output" />);

    const entry = { type: 'user', uuid: 'u1', message: { role: 'user', content: 'done' } };
    act(() => emitChange('/tmp/tasks/a1.output', `${JSON.stringify(entry)}\n`));

    expect(document.querySelector('.text-accent-primary')).not.toBeInTheDocument();
  });

  describe('auto-scroll', () => {
    // jsdom never lays anything out, so scrollHeight/clientHeight/scrollTop
    // are always 0 — stub them so the "was I at the bottom" math has real
    // numbers to compare, the same way the browser would supply them.
    function stubScrollMetrics(el: HTMLElement, { scrollHeight, clientHeight, scrollTop }: { scrollHeight: number; clientHeight: number; scrollTop: number }) {
      Object.defineProperty(el, 'scrollHeight', { configurable: true, value: scrollHeight });
      Object.defineProperty(el, 'clientHeight', { configurable: true, value: clientHeight });
      let top = scrollTop;
      Object.defineProperty(el, 'scrollTop', {
        configurable: true,
        get: () => top,
        set: (v) => { top = v; },
      });
    }

    function entryText(uuid: string, content: string) {
      return `${JSON.stringify({ type: 'user', uuid, message: { role: 'user', content } })}\n`;
    }

    it('auto-scrolls to the bottom when a push arrives while already at the bottom', () => {
      render(<AgentOutputTranscriptBody task={makeTask()} outputFile="/tmp/tasks/a1.output" />);
      // The scroll container only mounts once there is at least one message —
      // an empty transcript renders the "No messages yet." state instead.
      act(() => emitChange('/tmp/tasks/a1.output', entryText('u1', 'first')));
      const scrollEl = document.querySelector('.overflow-y-auto') as HTMLElement;
      stubScrollMetrics(scrollEl, { scrollHeight: 1000, clientHeight: 300, scrollTop: 700 }); // already at bottom

      act(() => emitChange('/tmp/tasks/a1.output', entryText('u1', 'first') + entryText('u2', 'second')));

      expect(scrollEl.scrollTop).toBe(1000);
      expect(screen.queryByText('Jump to bottom')).not.toBeInTheDocument();
    });

    it('shows "Jump to bottom" instead of forcing scroll when a push arrives while scrolled up', () => {
      render(<AgentOutputTranscriptBody task={makeTask()} outputFile="/tmp/tasks/a1.output" />);
      act(() => emitChange('/tmp/tasks/a1.output', entryText('u1', 'first')));
      const scrollEl = document.querySelector('.overflow-y-auto') as HTMLElement;

      // Second push lands while at the bottom (the auto-scroll baseline)...
      stubScrollMetrics(scrollEl, { scrollHeight: 1000, clientHeight: 300, scrollTop: 700 });
      act(() => emitChange('/tmp/tasks/a1.output', entryText('u1', 'first') + entryText('u2', 'second')));

      // ...then the user scrolls up to read earlier output.
      Object.defineProperty(scrollEl, 'scrollTop', { configurable: true, value: 0, writable: true });
      fireEvent.scroll(scrollEl);

      // A new push arrives while they're up there — must not yank them back down.
      act(() => emitChange('/tmp/tasks/a1.output', entryText('u1', 'first') + entryText('u2', 'second') + entryText('u3', 'third')));

      expect(scrollEl.scrollTop).toBe(0);
      expect(screen.getByText('Jump to bottom')).toBeInTheDocument();
    });

    it('clicking "Jump to bottom" scrolls down and hides the button', () => {
      render(<AgentOutputTranscriptBody task={makeTask()} outputFile="/tmp/tasks/a1.output" />);
      act(() => emitChange('/tmp/tasks/a1.output', entryText('u1', 'first')));
      const scrollEl = document.querySelector('.overflow-y-auto') as HTMLElement;

      stubScrollMetrics(scrollEl, { scrollHeight: 1000, clientHeight: 300, scrollTop: 700 });
      act(() => emitChange('/tmp/tasks/a1.output', entryText('u1', 'first') + entryText('u2', 'second')));
      Object.defineProperty(scrollEl, 'scrollTop', { configurable: true, value: 0, writable: true });
      fireEvent.scroll(scrollEl);
      act(() => emitChange('/tmp/tasks/a1.output', entryText('u1', 'first') + entryText('u2', 'second') + entryText('u3', 'third')));
      expect(screen.getByText('Jump to bottom')).toBeInTheDocument();

      fireEvent.click(screen.getByText('Jump to bottom'));

      expect(scrollEl.scrollTop).toBe(1000);
      expect(screen.queryByText('Jump to bottom')).not.toBeInTheDocument();
    });
  });
});
