import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent, cleanup } from '@testing-library/react';
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

// UserMessageRenderer (reused inside MessageBubble) reads useCliConfig(),
// which the real app provides via AppProviders — not present in this
// standalone render, same reason as AgentTranscriptModal/__tests__/index.test.tsx.
vi.mock('@/contexts/CliConfigContext', () => ({
  useCliConfig: () => ({ controlResponse: null, isLoading: false, refresh: vi.fn() }),
}));

// Auto-scroll reads the "Auto-scroll resume distance" setting; the default.
// Only useSettings is replaced: a factory returning just that would erase the
// module's other exports, which the message renderers read.
vi.mock('@/contexts/SettingsContext', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/contexts/SettingsContext')>()),
  useSettings: () => ({ settings: {} }),
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
    render(<AgentOutputTranscriptBody task={makeTask()} outputFile={undefined} sendCount={0} />);
    expect(screen.getByText('Starting task…')).toBeInTheDocument();
    expect(sendRawMock).not.toHaveBeenCalled();
  });

  it('parses pushed JSONL lines into chat bubbles instead of dumping raw text', () => {
    render(<AgentOutputTranscriptBody task={makeTask()} outputFile="/tmp/tasks/a1.output" sendCount={0} />);

    const entry = { type: 'user', uuid: 'u1', message: { role: 'user', content: 'reading cart.js now' } };
    act(() => emitChange('/tmp/tasks/a1.output', `${JSON.stringify(entry)}\n`));

    expect(screen.getByText('reading cart.js now')).toBeInTheDocument();
    // The raw JSON — braces, quoted keys — must not appear verbatim anywhere.
    expect(screen.queryByText(/"type":"user"/)).not.toBeInTheDocument();
  });

  it('skips a malformed line (e.g. one truncated mid-line by the backend cap) without blanking the rest', () => {
    render(<AgentOutputTranscriptBody task={makeTask()} outputFile="/tmp/tasks/a1.output" sendCount={0} />);

    const good = { type: 'user', uuid: 'u2', message: { role: 'user', content: 'second line is fine' } };
    const text = `{"type":"user","uuid":"u1","message":{"ro\n${JSON.stringify(good)}\n`;
    act(() => emitChange('/tmp/tasks/a1.output', text));

    expect(screen.getByText('second line is fine')).toBeInTheDocument();
  });

  it('shows the empty state once loaded with no parseable entries', () => {
    render(<AgentOutputTranscriptBody task={makeTask()} outputFile="/tmp/tasks/a1.output" sendCount={0} />);

    act(() => emitChange('/tmp/tasks/a1.output', ''));

    expect(screen.getByText('No messages yet.')).toBeInTheDocument();
  });

  it('shows the streaming indicator below the transcript while the task is running', () => {
    render(<AgentOutputTranscriptBody task={makeTask({ status: 'running' })} outputFile="/tmp/tasks/a1.output" sendCount={0} />);

    const entry = { type: 'user', uuid: 'u1', message: { role: 'user', content: 'still going' } };
    act(() => emitChange('/tmp/tasks/a1.output', `${JSON.stringify(entry)}\n`));

    expect(document.querySelector('.text-accent-primary')).toBeInTheDocument();
  });

  it('hides the streaming indicator once the task is no longer running', () => {
    render(<AgentOutputTranscriptBody task={makeTask({ status: 'completed' })} outputFile="/tmp/tasks/a1.output" sendCount={0} />);

    const entry = { type: 'user', uuid: 'u1', message: { role: 'user', content: 'done' } };
    act(() => emitChange('/tmp/tasks/a1.output', `${JSON.stringify(entry)}\n`));

    expect(document.querySelector('.text-accent-primary')).not.toBeInTheDocument();
  });

  describe('auto-scroll', () => {
    let raf: RafQueue;
    const FILE = '/tmp/tasks/a1.output';

    beforeEach(() => {
      localStorage.clear();
      raf = installRafQueue();
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    function entryText(uuid: string, content: string) {
      return `${JSON.stringify({ type: 'user', uuid, message: { role: 'user', content } })}\n`;
    }

    function replyText(uuid: string, text: string) {
      return `${JSON.stringify({ type: 'assistant', uuid, message: { role: 'assistant', content: [{ type: 'text', text }] } })}\n`;
    }

    const ONE = entryText('u1', 'first');
    // A reply, not a second prompt: a new prompt from the user is itself a
    // reason to follow again, which would hide what these tests look at.
    const TWO = ONE + replyText('m1', 'second');

    /** Push one entry, lay it out 1000px tall in a 300px view, and let it settle. */
    function open(task = makeTask(), sendCount = 0) {
      const view = render(<AgentOutputTranscriptBody task={task} outputFile={FILE} sendCount={sendCount} />);
      // The scroll container only mounts once there is at least one message —
      // an empty transcript renders the "No messages yet." state instead.
      act(() => emitChange(FILE, ONE));
      const box = stubScrollBox(document.querySelector('.overflow-y-auto') as HTMLElement, { scrollHeight: 1000, clientHeight: 300 });
      raf.flushFrames(2);
      const rerender = (nextTask: WorkflowTask, nextSendCount = sendCount) =>
        view.rerender(<AgentOutputTranscriptBody task={nextTask} outputFile={FILE} sendCount={nextSendCount} />);
      return { box, rerender };
    }

    it('opens at the newest entry', () => {
      const { box } = open();
      expect(box.el.scrollTop).toBe(700);
    });

    it('follows a running agent to the newest entry, gliding there', () => {
      const { box } = open();

      act(() => emitChange(FILE, TWO));
      box.setScrollHeight(1300);
      raf.flushFrames();

      expect(box.el.scrollTop).toBe(1000);
      expect(box.lastScrollTo()).toEqual({ top: 1300, behavior: 'smooth' });
      expect(screen.queryByText('Scroll to bottom')).not.toBeInTheDocument();
    });

    it('stays where the reader scrolled to while pushes keep arriving', () => {
      const { box } = open();
      box.userScrollTo(100);
      raf.flushFrames();

      act(() => emitChange(FILE, TWO));
      box.setScrollHeight(1300);
      raf.flushFrames(3);

      expect(box.el.scrollTop).toBe(100);
      expect(screen.getByText('Scroll to bottom')).toBeInTheDocument();
    });

    it('offers "Scroll to bottom" as soon as the reader scrolls up, and glides down when pressed', () => {
      const { box } = open();
      box.userScrollTo(100);
      raf.flushFrames();
      expect(screen.getByText('Scroll to bottom')).toBeInTheDocument();

      fireEvent.click(screen.getByText('Scroll to bottom'));

      expect(box.lastScrollTo()).toEqual({ top: 1000, behavior: 'smooth' });
      raf.flushFrames();
      expect(screen.queryByText('Scroll to bottom')).not.toBeInTheDocument();
    });

    it('follows again after the user sends the agent a message', () => {
      const { box, rerender } = open();
      box.userScrollTo(100);
      raf.flushFrames();

      rerender(makeTask(), 1);
      act(() => emitChange(FILE, TWO));
      box.setScrollHeight(1300);
      raf.flushFrames();

      expect(box.el.scrollTop).toBe(1000);
    });

    // The same signal the main chat follows on: the newest message the user
    // sent changing, here written into the transcript by the CLI on resume.
    it('follows again when a new message from the user lands in the transcript', () => {
      const { box } = open();
      box.userScrollTo(100);
      raf.flushFrames();

      act(() => emitChange(FILE, TWO + entryText('u2', 'and now this')));
      box.setScrollHeight(1300);
      raf.flushFrames();

      expect(box.el.scrollTop).toBe(1000);
    });

    // Every opening starts at the newest entry; no reading position is kept.
    it('opens at the newest entry again after being scrolled up, and stores nothing', () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      const first = open();
      first.box.userScrollTo(100);
      raf.flushFrames();
      vi.advanceTimersByTime(1000);
      vi.useRealTimers();
      cleanup();

      expect(localStorage.length).toBe(0);
      const { box } = open();
      expect(box.el.scrollTop).toBe(700);
    });

    it('does not read a position stored under its key', () => {
      localStorage.setItem(`claude-gui:scroll:task-output:${FILE}`, '200');
      const { box } = open();
      expect(box.el.scrollTop).toBe(700);
      // Not read, and so not removed either.
      expect(localStorage.getItem(`claude-gui:scroll:task-output:${FILE}`)).toBe('200');
    });
  });
});
