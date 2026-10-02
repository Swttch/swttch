import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor, cleanup } from '@testing-library/react';
import type { WorkflowTask } from '@/shared';
import { installRafQueue, stubScrollBox, type RafQueue } from '@/hooks/__tests__/scrollTestKit';

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

// Auto-scroll reads the "Auto-scroll resume distance" setting; the default.
// Only useSettings is replaced: a factory returning just that would erase the
// module's other exports, which the message renderers read.
vi.mock('@/contexts/SettingsContext', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/contexts/SettingsContext')>()),
  useSettings: () => ({ settings: {} }),
}));

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
    const task = makeTask({ outputFile: undefined });
    render(<BackgroundTaskOutputBody task={task} outputFile={task.outputFile} />);
    expect(screen.getByText('Starting task…')).toBeInTheDocument();
    expect(sendRawMock).not.toHaveBeenCalled();
  });

  it('watches the file and shows a tail -f command while running', () => {
    const task = makeTask({ status: 'running' });
    render(<BackgroundTaskOutputBody task={task} outputFile={task.outputFile} />);

    expect(sendRawMock).toHaveBeenCalledWith(MessageType.WATCH_BACKGROUND_TASK_OUTPUT, { outputFile: '/tmp/tasks/b1.output' });
    expect(screen.getByText('tail -f -n +1 /tmp/tasks/b1.output')).toBeInTheDocument();
  });

  it('shows a cat command for a finished task', () => {
    const task = makeTask({ status: 'completed' });
    render(<BackgroundTaskOutputBody task={task} outputFile={task.outputFile} />);
    expect(screen.getByText('cat /tmp/tasks/b1.output')).toBeInTheDocument();
  });

  it('copies the command to the clipboard when the copy button is clicked', async () => {
    const task = makeTask({ status: 'running' });
    render(<BackgroundTaskOutputBody task={task} outputFile={task.outputFile} />);

    fireEvent.click(screen.getByTitle('Copy command'));

    await waitFor(() => expect(writeTextMock).toHaveBeenCalledWith('tail -f -n +1 /tmp/tasks/b1.output'));
  });

  it('renders the log text pushed from BACKGROUND_TASK_OUTPUT_CHANGED', () => {
    const task = makeTask();
    render(<BackgroundTaskOutputBody task={task} outputFile={task.outputFile} />);

    act(() => emitChange('/tmp/tasks/b1.output', 'count: 1\ncount: 2\n'));

    expect(screen.getByText(/count: 1/)).toBeInTheDocument();
  });

  it('stops watching (unwatch) when the modal body unmounts', () => {
    const task = makeTask();
    const { unmount } = render(<BackgroundTaskOutputBody task={task} outputFile={task.outputFile} />);
    unmount();
    expect(sendRawMock).toHaveBeenCalledWith(MessageType.UNWATCH_BACKGROUND_TASK_OUTPUT, { outputFile: '/tmp/tasks/b1.output' });
  });

  it('shows the truncated notice when the pushed payload says so', () => {
    const task = makeTask();
    render(<BackgroundTaskOutputBody task={task} outputFile={task.outputFile} />);
    act(() => emitChange('/tmp/tasks/b1.output', 'count: 999\n', true));
    expect(screen.getByText(/Showing the most recent/)).toBeInTheDocument();
  });

  describe('auto-scroll', () => {
    let raf: RafQueue;
    const FILE = '/tmp/tasks/b1.output';

    beforeEach(() => {
      localStorage.clear();
      raf = installRafQueue();
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    /** The pane mounts with the body; lay it out 1000px tall in a 300px view and push `text`. */
    function open(text = 'count: 1\n') {
      const task = makeTask();
      render(<BackgroundTaskOutputBody task={task} outputFile={task.outputFile} />);
      const box = stubScrollBox(document.querySelector('.overflow-y-auto') as HTMLElement, { scrollHeight: 1000, clientHeight: 300 });
      act(() => emitChange(FILE, text));
      raf.flushFrames(2);
      return box;
    }

    it('opens at the newest output', () => {
      const box = open();
      expect(box.el.scrollTop).toBe(700);
    });

    it('follows a running task to the newest output, gliding there', () => {
      const box = open();

      act(() => emitChange(FILE, 'count: 1\ncount: 2\n'));
      box.setScrollHeight(1300);
      raf.flushFrames();

      expect(box.el.scrollTop).toBe(1000);
      expect(box.lastScrollTo()).toEqual({ top: 1300, behavior: 'smooth' });
      expect(screen.queryByText('Scroll to bottom')).not.toBeInTheDocument();
    });

    it('stays where the reader scrolled to while pushes keep arriving', () => {
      const box = open();
      box.userScrollTo(100);
      raf.flushFrames();

      act(() => emitChange(FILE, 'count: 1\ncount: 2\n'));
      box.setScrollHeight(1300);
      raf.flushFrames(3);

      expect(box.el.scrollTop).toBe(100);
      expect(screen.getByText('Scroll to bottom')).toBeInTheDocument();
    });

    it('offers "Scroll to bottom" as soon as the reader scrolls up, and glides down when pressed', () => {
      const box = open();
      box.userScrollTo(100);
      raf.flushFrames();
      expect(screen.getByText('Scroll to bottom')).toBeInTheDocument();

      fireEvent.click(screen.getByText('Scroll to bottom'));

      expect(box.lastScrollTo()).toEqual({ top: 1000, behavior: 'smooth' });
      raf.flushFrames();
      expect(screen.queryByText('Scroll to bottom')).not.toBeInTheDocument();
    });

    // Every opening starts at the newest output; no reading position is kept.
    it('opens at the newest output again after being scrolled up, and stores nothing', () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      const first = open();
      first.userScrollTo(100);
      raf.flushFrames();
      vi.advanceTimersByTime(1000);
      vi.useRealTimers();
      cleanup();

      expect(localStorage.length).toBe(0);
      const box = open();
      expect(box.el.scrollTop).toBe(700);
    });

    it('does not read a position stored under its key', () => {
      localStorage.setItem(`claude-gui:scroll:task-output:${FILE}`, '200');
      const box = open();
      expect(box.el.scrollTop).toBe(700);
      expect(localStorage.getItem(`claude-gui:scroll:task-output:${FILE}`)).toBe('200');
    });

    // The backend sends only the last 200,000 characters of a log, so past
    // that every push drops lines at the top as it adds them at the bottom.
    // In a real browser that slid the text up under a reader who had scrolled
    // back (see frontTrim.ts for the measurement).
    describe('when the log is cut from the front', () => {
      const LINE_PX = 20;
      const lines = (from: number, to: number) =>
        Array.from({ length: to - from }, (_, i) => `count: ${from + i}\n`).join('');

      // jsdom has no layout, so a character's box is made up here: every line
      // is LINE_PX tall and a character sits on the line its index falls in.
      beforeEach(() => {
        Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
          configurable: true,
          value(this: Range) {
            const text = this.startContainer.textContent ?? '';
            const line = text.slice(0, this.startOffset).split('\n').length - 1;
            return { top: line * LINE_PX, bottom: (line + 1) * LINE_PX } as DOMRect;
          },
        });
      });

      afterEach(() => {
        delete (Range.prototype as Partial<Range>).getBoundingClientRect;
      });

      it('keeps the line being read where it was', () => {
        const box = open(lines(0, 50)); // 50 lines, 1000px
        box.userScrollTo(400); // line 20 at the top of the view
        raf.flushFrames();

        // 10 lines leave at the top, 10 arrive at the bottom: same height.
        act(() => emitChange(FILE, lines(10, 60), true));
        raf.flushFrames(2);

        // Line 20 is now the 10th line down, 200px from the top.
        expect(box.el.scrollTop).toBe(200);
      });

      it('leaves a following view at the bottom', () => {
        const box = open(lines(0, 50));
        act(() => emitChange(FILE, lines(10, 60), true));
        raf.flushFrames(2);
        expect(box.el.scrollTop).toBe(700);
      });
    });
  });
});
