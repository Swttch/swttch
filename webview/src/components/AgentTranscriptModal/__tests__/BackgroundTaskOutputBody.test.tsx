import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
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

const writeTextMock = vi.fn().mockResolvedValue(undefined);
Object.assign(navigator, { clipboard: { writeText: writeTextMock } });

import { BackgroundTaskOutputBody } from '../BackgroundTaskOutputBody';
import { MessageType } from '@/shared';

function makeTask(overrides: Partial<WorkflowTask> = {}): WorkflowTask {
  return {
    toolUseId: 'toolu_1',
    taskType: 'local_bash',
    outputFile: '/tmp/tasks/b1.output',
    name: 'Print count every second',
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

describe('BackgroundTaskOutputBody', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handlers.clear();
  });

  it('shows a starting state when outputFile is not yet known', () => {
    render(<BackgroundTaskOutputBody task={makeTask({ outputFile: undefined })} />);
    expect(screen.getByText('Starting task…')).toBeInTheDocument();
    expect(sendRawMock).not.toHaveBeenCalled();
  });

  it('watches the file and shows a tail -f command while running', () => {
    render(<BackgroundTaskOutputBody task={makeTask({ status: 'running' })} />);

    expect(sendRawMock).toHaveBeenCalledWith(MessageType.WATCH_BACKGROUND_TASK_OUTPUT, { outputFile: '/tmp/tasks/b1.output' });
    expect(screen.getByText('tail -f -n +1 /tmp/tasks/b1.output')).toBeInTheDocument();
  });

  it('shows a cat command for a finished task', () => {
    render(<BackgroundTaskOutputBody task={makeTask({ status: 'completed' })} />);
    expect(screen.getByText('cat /tmp/tasks/b1.output')).toBeInTheDocument();
  });

  it('copies the command to the clipboard when the copy button is clicked', async () => {
    render(<BackgroundTaskOutputBody task={makeTask({ status: 'running' })} />);

    fireEvent.click(screen.getByTitle('Copy command'));

    await waitFor(() => expect(writeTextMock).toHaveBeenCalledWith('tail -f -n +1 /tmp/tasks/b1.output'));
  });

  it('renders the log text pushed from BACKGROUND_TASK_OUTPUT_CHANGED', () => {
    render(<BackgroundTaskOutputBody task={makeTask()} />);

    act(() => emitChange('/tmp/tasks/b1.output', 'count: 1\ncount: 2\n'));

    expect(screen.getByText(/count: 1/)).toBeInTheDocument();
  });

  it('stops watching (unwatch) when the modal body unmounts', () => {
    const { unmount } = render(<BackgroundTaskOutputBody task={makeTask()} />);
    unmount();
    expect(sendRawMock).toHaveBeenCalledWith(MessageType.UNWATCH_BACKGROUND_TASK_OUTPUT, { outputFile: '/tmp/tasks/b1.output' });
  });

  it('shows the truncated notice when the pushed payload says so', () => {
    render(<BackgroundTaskOutputBody task={makeTask()} />);
    act(() => emitChange('/tmp/tasks/b1.output', 'count: 999\n', true));
    expect(screen.getByText(/Showing the most recent/)).toBeInTheDocument();
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

    it('auto-scrolls to the bottom when a push arrives while already at the bottom', () => {
      render(<BackgroundTaskOutputBody task={makeTask()} />);
      const scrollEl = document.querySelector('.overflow-y-auto') as HTMLElement;
      stubScrollMetrics(scrollEl, { scrollHeight: 1000, clientHeight: 300, scrollTop: 700 }); // already at bottom

      act(() => emitChange('/tmp/tasks/b1.output', 'count: 1\n'));

      expect(scrollEl.scrollTop).toBe(1000);
      expect(screen.queryByText('Jump to bottom')).not.toBeInTheDocument();
    });

    it('shows "Jump to bottom" instead of forcing scroll when a push arrives while scrolled up', () => {
      render(<BackgroundTaskOutputBody task={makeTask()} />);
      const scrollEl = document.querySelector('.overflow-y-auto') as HTMLElement;

      // First push lands while at the bottom (the initial auto-scroll baseline)...
      stubScrollMetrics(scrollEl, { scrollHeight: 1000, clientHeight: 300, scrollTop: 700 });
      act(() => emitChange('/tmp/tasks/b1.output', 'count: 1\n'));

      // ...then the user scrolls up to read earlier output.
      Object.defineProperty(scrollEl, 'scrollTop', { configurable: true, value: 0, writable: true });
      fireEvent.scroll(scrollEl);

      // A new push arrives while they're up there — must not yank them back down.
      act(() => emitChange('/tmp/tasks/b1.output', 'count: 1\ncount: 2\n'));

      expect(scrollEl.scrollTop).toBe(0);
      expect(screen.getByText('Jump to bottom')).toBeInTheDocument();
    });

    it('clicking "Jump to bottom" scrolls down and hides the button', () => {
      render(<BackgroundTaskOutputBody task={makeTask()} />);
      const scrollEl = document.querySelector('.overflow-y-auto') as HTMLElement;

      stubScrollMetrics(scrollEl, { scrollHeight: 1000, clientHeight: 300, scrollTop: 700 });
      act(() => emitChange('/tmp/tasks/b1.output', 'count: 1\n'));
      Object.defineProperty(scrollEl, 'scrollTop', { configurable: true, value: 0, writable: true });
      fireEvent.scroll(scrollEl);
      act(() => emitChange('/tmp/tasks/b1.output', 'count: 1\ncount: 2\n'));
      expect(screen.getByText('Jump to bottom')).toBeInTheDocument();

      fireEvent.click(screen.getByText('Jump to bottom'));

      expect(scrollEl.scrollTop).toBe(1000);
      expect(screen.queryByText('Jump to bottom')).not.toBeInTheDocument();
    });
  });
});
