import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent, cleanup } from '@testing-library/react';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { createTestQueryClient } from '@/hooks/queries/__tests__/testQueryClient';
import type { WorkflowAgent, WorkflowStatus } from '@/shared';
import { installRafQueue, stubScrollBox, type RafQueue } from '@/hooks/__tests__/scrollTestKit';

const sendMock = vi.fn();
vi.mock('@/hooks/useBridge', () => ({
  useBridge: () => ({ send: sendMock }),
}));

// UserMessageRenderer (reused inside MessageBubble) reads useCliConfig(), which
// the real app provides far above this body.
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

import { AgentTranscriptBody } from '../AgentTranscriptBody';

function makeAgent(overrides: Partial<WorkflowAgent> = {}): WorkflowAgent {
  return {
    type: 'workflow_agent',
    index: 1,
    agentId: 'a1',
    label: 'explore:Agent One',
    state: 'progress',
    tokens: 100,
    toolCalls: 1,
    durationMs: 1000,
    ...overrides,
  };
}

function userEntry(uuid: string, content: string) {
  return { type: 'user', uuid, message: { role: 'user', content } };
}

function assistantEntry(uuid: string, text: string) {
  return { type: 'assistant', uuid, message: { role: 'assistant', content: [{ type: 'text', text }] } };
}

type Entry = Record<string, unknown>;

/** A reply the test resolves by hand, so the state in between can be looked at. */
function deferredReply() {
  let settle!: (reply: { status: string; entries?: Entry[]; error?: string }) => void;
  const promise = new Promise((r) => {
    settle = r;
  });
  return {
    promise,
    resolve: (entries: Entry[]) => settle({ status: 'ok', entries }),
    fail: () => settle({ status: 'error', error: 'read failed' }),
  };
}

interface BodyProps {
  agent: WorkflowAgent;
  taskStatus?: WorkflowStatus;
  sendCount?: number;
}

function renderBody(client: QueryClient, initial: BodyProps) {
  let current = initial;
  const ui = (p: BodyProps) => (
    <QueryClientProvider client={client}>
      <AgentTranscriptBody transcriptDir="/wf/dir" agent={p.agent} taskStatus={p.taskStatus ?? 'running'} sendCount={p.sendCount ?? 0} />
    </QueryClientProvider>
  );
  const utils = render(ui(initial));
  const rerenderWith = (next: Partial<BodyProps>) => {
    current = { ...current, ...next };
    utils.rerender(ui(current));
  };
  return { ...utils, rerenderWith };
}

function scrollArea(): HTMLElement {
  return document.querySelector('.overflow-y-auto') as HTMLElement;
}

const FIRST: Entry[] = [userEntry('u1', 'first prompt'), assistantEntry('m1', 'first reply')];
const SECOND: Entry[] = [...FIRST, assistantEntry('m2', 'second reply')];
const NOTICE = "Couldn't refresh this transcript. Showing the last version that loaded.";

describe('AgentTranscriptBody', () => {
  let raf: RafQueue;
  let client: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    raf = installRafQueue();
    client = createTestQueryClient();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** Load FIRST, lay it out 2000px tall in a 400px view, and let it settle. */
  async function openTranscript(props: Partial<BodyProps> = {}) {
    sendMock.mockResolvedValueOnce({ status: 'ok', entries: FIRST });
    const view = renderBody(client, { agent: makeAgent(), ...props });
    await screen.findByText('first reply');
    const box = stubScrollBox(scrollArea(), { scrollHeight: 2000, clientHeight: 400 });
    raf.flushFrames(2);
    return { ...view, box };
  }

  /** The agent's stats move, its transcript is refetched, and the reply carries `entries`. */
  async function progress(rerenderWith: (next: Partial<BodyProps>) => void, tokens: number, entries: Entry[]) {
    const reply = deferredReply();
    sendMock.mockReturnValueOnce(reply.promise);
    rerenderWith({ agent: makeAgent({ tokens, toolCalls: tokens / 100 }) });
    await act(async () => {
      reply.resolve(entries);
    });
  }

  // Issue #511. A running agent's transcript is refetched each time its live
  // stats move, and the refetch used to start a brand new query with no data:
  // the body swapped the scroll area for a spinner and mounted a fresh one at
  // the top when the reply came back, which is the reader being thrown to the
  // top, the bottom, or somewhere in between on every tool call.
  it('keeps the scroll area and the reading position through a progress refetch', async () => {
    const { box, rerenderWith } = await openTranscript();
    box.userScrollTo(500);
    raf.flushFrames();

    const next = deferredReply();
    sendMock.mockReturnValueOnce(next.promise);
    rerenderWith({ agent: makeAgent({ tokens: 250, toolCalls: 2 }) });

    // While the refetch is in flight the transcript already on screen stays.
    expect(screen.queryByText('Loading transcript…')).not.toBeInTheDocument();
    expect(box.el.isConnected).toBe(true);
    expect(screen.getByText('first reply')).toBeInTheDocument();

    await act(async () => {
      next.resolve(SECOND);
    });
    await screen.findByText('second reply');
    box.setScrollHeight(2400);
    raf.flushFrames(3);

    expect(scrollArea()).toBe(box.el);
    expect(box.el.scrollTop).toBe(500);
  });

  it('keeps showing the transcript when a refetch fails', async () => {
    const { box, rerenderWith } = await openTranscript();

    const next = deferredReply();
    sendMock.mockReturnValueOnce(next.promise);
    rerenderWith({ agent: makeAgent({ tokens: 250 }) });
    await act(async () => {
      next.fail();
    });
    // Wait until the failure has actually reached the screen.
    await screen.findByText(NOTICE);

    expect(screen.queryByText('Failed to load transcript.')).not.toBeInTheDocument();
    expect(screen.getByText('first reply')).toBeInTheDocument();
    expect(box.el.isConnected).toBe(true);
  });

  // The old transcript stays up through a failed refetch, so the failure has
  // to be said, or a transcript that stopped updating would look live.
  describe('when a refresh fails', () => {
    async function fail(rerenderWith: (next: Partial<BodyProps>) => void, tokens: number) {
      const reply = deferredReply();
      sendMock.mockReturnValueOnce(reply.promise);
      rerenderWith({ agent: makeAgent({ tokens }) });
      await act(async () => {
        reply.fail();
      });
      // react-query hands the failure over on a later tick.
      await screen.findByText(NOTICE);
    }

    it('says so in a line outside the scrolling area, without replacing it or moving it', async () => {
      const { box, rerenderWith } = await openTranscript();
      box.userScrollTo(500);
      raf.flushFrames();

      await fail(rerenderWith, 250);
      raf.flushFrames(2);

      const notice = screen.getByText(NOTICE);
      expect(notice).toBeInTheDocument();
      expect(box.el.contains(notice)).toBe(false);
      expect(scrollArea()).toBe(box.el);
      expect(box.el.scrollTop).toBe(500);
    });

    it('keeps saying so while the next tries are under way, and stops once one succeeds', async () => {
      const { box, rerenderWith } = await openTranscript();
      box.userScrollTo(500);
      raf.flushFrames();
      await fail(rerenderWith, 250);

      // The next progress tick starts another try; until it answers, nothing
      // has succeeded, so the line stays rather than blinking off and on.
      const retry = deferredReply();
      sendMock.mockReturnValueOnce(retry.promise);
      rerenderWith({ agent: makeAgent({ tokens: 300 }) });
      expect(screen.getByText(NOTICE)).toBeInTheDocument();

      await act(async () => {
        retry.resolve(SECOND);
      });
      await screen.findByText('second reply');
      raf.flushFrames(2);

      expect(screen.queryByText(NOTICE)).not.toBeInTheDocument();
      expect(scrollArea()).toBe(box.el);
      expect(box.el.scrollTop).toBe(500);
    });

    it('is not shown while refreshes succeed', async () => {
      const { rerenderWith } = await openTranscript();
      await progress(rerenderWith, 200, SECOND);
      expect(screen.queryByText(NOTICE)).not.toBeInTheDocument();
    });
  });

  it('still says so when the very first load fails', async () => {
    sendMock.mockResolvedValueOnce({ status: 'error', error: 'read failed' });
    renderBody(client, { agent: makeAgent() });
    expect(await screen.findByText('Failed to load transcript.')).toBeInTheDocument();
  });

  it('opens at the newest entry', async () => {
    const { box } = await openTranscript();
    expect(box.el.scrollTop).toBe(1600);
  });

  it('follows a running agent to its newest entry, gliding there', async () => {
    const { box, rerenderWith } = await openTranscript();

    await progress(rerenderWith, 200, SECOND);
    box.setScrollHeight(2400);
    raf.flushFrames();

    expect(box.el.scrollTop).toBe(2000);
    expect(box.lastScrollTo()).toEqual({ top: 2400, behavior: 'smooth' });
  });

  it('moves straight there, without gliding, once the agent is done', async () => {
    const { box, rerenderWith } = await openTranscript({ taskStatus: 'completed' });

    await progress(rerenderWith, 200, SECOND);
    box.setScrollHeight(2400);
    raf.flushFrames();

    expect(box.lastScrollTo()).toEqual({ top: 2400, behavior: 'auto' });
  });

  it('offers "Scroll to bottom" as soon as the reader scrolls up, and glides down when pressed', async () => {
    const { box } = await openTranscript();
    expect(screen.queryByText('Scroll to bottom')).not.toBeInTheDocument();

    box.userScrollTo(500);
    raf.flushFrames();
    expect(screen.getByText('Scroll to bottom')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Scroll to bottom'));
    expect(box.lastScrollTo()).toEqual({ top: 2000, behavior: 'smooth' });
    raf.flushFrames();
    expect(screen.queryByText('Scroll to bottom')).not.toBeInTheDocument();
  });

  // The main chat follows again the moment you send. A message to an agent
  // only shows up here once the CLI has resumed the agent, so the modal's own
  // count of sends is what has to do it.
  it('follows again after the user sends the agent a message', async () => {
    const { box, rerenderWith } = await openTranscript();
    box.userScrollTo(500);
    raf.flushFrames();

    rerenderWith({ sendCount: 1 });
    raf.flushFrames();
    expect(screen.queryByText('Scroll to bottom')).not.toBeInTheDocument();

    await progress(rerenderWith, 200, SECOND);
    box.setScrollHeight(2400);
    raf.flushFrames();

    expect(box.el.scrollTop).toBe(2000);
  });

  // The message just sent is not on screen yet, so nothing grows for a few
  // seconds. Following alone would leave the view where it was, with the button
  // hidden; the send has to take the view down by itself.
  it('glides to the newest entry the moment a message is sent, before anything new arrives', async () => {
    const { box, rerenderWith } = await openTranscript();
    box.userScrollTo(500);
    raf.flushFrames();
    const callsBefore = box.scrollToCalls.length;

    rerenderWith({ sendCount: 1 });

    expect(box.scrollToCalls.length).toBe(callsBefore + 1);
    expect(box.lastScrollTo()).toEqual({ top: 2000, behavior: 'smooth' });
  });

  it('does not move a transcript that is opened after earlier sends', async () => {
    const { box } = await openTranscript({ sendCount: 3 });
    expect(box.scrollToCalls.filter((call) => call.behavior === 'smooth')).toHaveLength(0);
  });

  // Every opening starts at the newest entry; no reading position is kept.
  it('opens at the newest entry again after being scrolled up, and stores nothing', async () => {
    const first = await openTranscript();
    first.box.userScrollTo(300);
    raf.flushFrames();
    // Longer than the 300ms a remembered position waits before it is written.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 400));
    });
    cleanup();

    expect(localStorage.length).toBe(0);
    client = createTestQueryClient();
    const { box } = await openTranscript();
    expect(box.el.scrollTop).toBe(1600);
  });

  it('does not read a position stored under its key', async () => {
    localStorage.setItem('claude-gui:scroll:agent:a1', '700');
    const { box } = await openTranscript();
    expect(box.el.scrollTop).toBe(1600);
    expect(localStorage.getItem('claude-gui:scroll:agent:a1')).toBe('700');
  });
});
