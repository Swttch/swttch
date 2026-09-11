import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient } from '@/hooks/queries/__tests__/testQueryClient';
import type { WorkflowTask } from '@/shared';

const sendMock = vi.fn();
vi.mock('@/hooks/useBridge', () => ({
  useBridge: () => ({ send: sendMock }),
}));

// UserMessageRenderer (reused inside AgentTranscriptBody via MessageBubble)
// reads useCliConfig(), which the real app provides via AppProviders far above
// BackgroundTasksPanel. This modal is tested standalone, so it needs the same
// provider — a no-op value is enough since these tests don't exercise slash
// command parsing.
vi.mock('@/contexts/CliConfigContext', () => ({
  useCliConfig: () => ({ controlResponse: null, isLoading: false, refresh: vi.fn() }),
}));

// useBackgroundTaskActions pulls in Bridge/Session/ChatStream/WorkflowState
// context, none of which this standalone modal test wires up. The cancel
// button's own wiring is exercised directly below; here it only needs to not
// throw on mount.
const cancelTaskMock = vi.fn();
vi.mock('@/hooks/useBackgroundTaskActions', () => ({
  useBackgroundTaskActions: () => ({ cancelTask: cancelTaskMock }),
}));

// The composer under each transcript reads the session's mode (for the send
// button's colour) and one app setting (Enter vs Ctrl+Enter).
vi.mock('@/contexts/SessionContext', () => ({
  useSessionContext: () => ({ inputMode: 'ask_before_edit' }),
}));
vi.mock('@/contexts/SettingsContext', () => ({
  useSettings: () => ({ settings: { useCtrlEnterToSend: false } }),
}));

import { AgentTranscriptModal } from '../index';

function makeTask(overrides: Partial<WorkflowTask> = {}): WorkflowTask {
  return {
    toolUseId: 'toolu_1',
    transcriptDir: '/wf/dir',
    name: 'demo-workflow',
    status: 'completed',
    startedAt: 0,
    phases: [],
    // Shaped like the CLI's own `workflow_progress[]` entry, which is what the
    // backend now forwards untouched: `state`/`toolCalls` are its field names,
    // and `model`/`promptPreview` are fields nothing used to carry this far.
    agents: [
      {
        type: 'workflow_agent',
        index: 1,
        agentId: 'a1',
        label: 'explore:Agent One',
        phaseIndex: 1,
        phaseTitle: 'Explore',
        state: 'done',
        model: 'claude-haiku-4-5-20251001',
        promptPreview: 'Look at the first file',
        tokens: 100,
        toolCalls: 2,
        durationMs: 5000,
      },
      {
        type: 'workflow_agent',
        index: 2,
        agentId: 'a2',
        label: 'explore:Agent Two',
        phaseIndex: 1,
        phaseTitle: 'Explore',
        state: 'progress',
        model: 'claude-sonnet-5',
        tokens: 50,
        toolCalls: 1,
        durationMs: 3000,
      },
    ],
    ...overrides,
  };
}

function renderModal(task: WorkflowTask, onClose = vi.fn()) {
  const client = createTestQueryClient();
  return {
    onClose,
    ...render(
      <QueryClientProvider client={client}>
        <AgentTranscriptModal task={task} onClose={onClose} />
      </QueryClientProvider>,
    ),
  };
}

describe('AgentTranscriptModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cancelTaskMock.mockClear();
  });

  it('requests the first agent transcript by default and renders its messages', async () => {
    sendMock.mockResolvedValue({
      status: 'ok',
      entries: [{ type: 'user', uuid: 'u1', message: { role: 'user', content: 'hello agent' } }],
      truncated: false,
    });

    renderModal(makeTask());

    await waitFor(() => expect(sendMock).toHaveBeenCalled());
    const [, payload] = sendMock.mock.calls[0];
    expect(payload).toMatchObject({ transcriptDir: '/wf/dir', agentId: 'a1' });

    await waitFor(() => expect(screen.getByText('hello agent')).toBeInTheDocument());
  });

  it('switches to the second agent transcript when its tab is clicked', async () => {
    sendMock.mockResolvedValue({ status: 'ok', entries: [], truncated: false });
    renderModal(makeTask());

    await waitFor(() => expect(sendMock).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByText('Agent Two'));

    await waitFor(() => {
      const lastCall = sendMock.mock.calls[sendMock.mock.calls.length - 1];
      expect(lastCall[1]).toMatchObject({ transcriptDir: '/wf/dir', agentId: 'a2' });
    });
  });

  it('calls onClose when the close button is clicked', async () => {
    sendMock.mockResolvedValue({ status: 'ok', entries: [], truncated: false });
    const { onClose } = renderModal(makeTask());

    fireEvent.click(screen.getByTitle('Close'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose on Escape', async () => {
    sendMock.mockResolvedValue({ status: 'ok', entries: [], truncated: false });
    const { onClose } = renderModal(makeTask());

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows the empty state when the workflow has no agents yet', () => {
    renderModal(makeTask({ agents: [] }));

    expect(sendMock).not.toHaveBeenCalled();
    expect(screen.getByText('No agents yet.')).toBeInTheDocument();
  });

  // The modal is the detail view for a panel card; it must not show less
  // information than the summary card that opened it (issue #347 follow-up).
  it('shows the same summary info the panel card shows: status, agent count, tokens, description', () => {
    sendMock.mockResolvedValue({ status: 'ok', entries: [], truncated: false });
    renderModal(makeTask({ description: 'Explore two files in parallel' }));

    expect(screen.getByText('completed')).toBeInTheDocument();
    expect(screen.getByText('2 agents')).toBeInTheDocument();
    expect(screen.getByText('Explore two files in parallel')).toBeInTheDocument();
  });

  it('shows a cancel button only while running, and it calls cancelTask with the task', () => {
    sendMock.mockResolvedValue({ status: 'ok', entries: [], truncated: false });
    const { rerender } = renderModal(makeTask({ status: 'running' }));

    const cancelButton = screen.getByText('Cancel this task');
    fireEvent.click(cancelButton);
    expect(cancelTaskMock).toHaveBeenCalledWith(expect.objectContaining({ toolUseId: 'toolu_1' }));

    rerender(
      <QueryClientProvider client={createTestQueryClient()}>
        <AgentTranscriptModal task={makeTask({ status: 'completed' })} onClose={vi.fn()} />
      </QueryClientProvider>,
    );
    expect(screen.queryByText('Cancel this task')).not.toBeInTheDocument();
  });

  // The whole point of forwarding the CLI's entry untouched is that the last
  // component in the chain can use it: the chip reads `tokens`/`durationMs`
  // straight off the CLI's own entry, fields that used to be renamed or dropped
  // before they got this far.
  it('shows the CLI\'s own tokens and duration on the chip', () => {
    sendMock.mockResolvedValue({ status: 'ok', entries: [], truncated: false });
    renderModal(makeTask());

    expect(screen.getByText('100 · 5s')).toBeInTheDocument();
    expect(screen.getByText('50 · 3s')).toBeInTheDocument();
  });

  // Native `title` tooltips do not render in the JCEF WebView the plugin embeds,
  // so the prompt preview goes through the Tippy-based Tooltip instead. A chip
  // carrying a `title` would look fine in a browser and show nothing in the IDE.
  it('puts the prompt preview in a tooltip, not a native title attribute', () => {
    sendMock.mockResolvedValue({ status: 'ok', entries: [], truncated: false });
    renderModal(makeTask());

    const chip = screen.getByText('Agent One').closest('button')!;
    expect(chip.getAttribute('title')).toBeNull();
    // Closed, the preview is nowhere in the picker; it is the tooltip's content.
    // (The detail header shows the selected agent's prompt in the open, which is
    // a different thing from this chip's hover text.)
    const picker = chip.closest('[class*="sm:max-w-52"]') as HTMLElement;
    expect(picker.textContent).not.toContain('Look at the first file');
  });

  // Phases are how a multi-phase workflow is meant to be read, and the count
  // says how big each one is without making the reader tally chips.
  it('groups the chips under their phase, with the agent count', () => {
    sendMock.mockResolvedValue({ status: 'ok', entries: [], truncated: false });
    renderModal(makeTask());

    const header = screen.getByText('Explore').parentElement!;
    expect(header).toHaveTextContent('Explore');
    expect(header).toHaveTextContent('2');
  });

  // The header used to list the declared phases while the picker grouped the
  // agents under those same phases, so every phase name appeared twice. The
  // picker's copy says more (it counts the agents), so the header drops its own.
  it('names each phase once, in the picker rather than the header', () => {
    sendMock.mockResolvedValue({ status: 'ok', entries: [], truncated: false });
    renderModal(makeTask({ phases: [{ title: 'Explore' }] }));

    expect(screen.getAllByText('Explore')).toHaveLength(1);
    expect(screen.getByText('Explore').closest('[class*="sm:max-w-52"]')).not.toBeNull();
  });

  // The label repeats the phase it runs in (`explore:Agent One` in phase
  // `Explore`). Under a header that already says `Explore`, that prefix is
  // noise taking width the agent's own name needs.
  it('drops the phase prefix the label repeats', () => {
    sendMock.mockResolvedValue({ status: 'ok', entries: [], truncated: false });
    renderModal(makeTask());

    expect(screen.getByText('Agent One')).toBeInTheDocument();
    expect(screen.queryByText('explore:Agent One')).not.toBeInTheDocument();
  });

  it('resizes the modal by dragging the resize handle', () => {
    sendMock.mockResolvedValue({ status: 'ok', entries: [], truncated: false });
    renderModal(makeTask());

    const handle = screen.getByTitle('Drag to resize');
    // The height lives on the handle's own sibling wrapper (relative div),
    // not the handle itself. It's calc(60vh + offset) — only the offset
    // moves when dragging, the 60vh term stays fixed.
    const wrapper = handle.parentElement as HTMLElement;
    const initialHeight = wrapper.style.height;
    // jsdom normalizes calc() term order (px before vh) on the way back out
    // of style.height — this is a jsdom serialization quirk, not what a real
    // browser does, but it's what this test observes either way.
    expect(initialHeight).toBe('calc(180px + 60vh)');

    fireEvent.pointerDown(handle, { clientY: 500 });
    fireEvent.pointerMove(window, { clientY: 510 }); // dragged down 10px, well under the max
    expect(wrapper.style.height).toBe('calc(190px + 60vh)');

    fireEvent.pointerUp(window);
    fireEvent.pointerMove(window, { clientY: 700 }); // no active drag — ignored
    expect(wrapper.style.height).toBe('calc(190px + 60vh)');
  });

  // What made a 100-agent workflow squeeze the transcript down to ~30px was
  // the picker wrapping: stacked above the transcript, every extra row of
  // agents took height away from it (issue #425). Neither shape the picker
  // takes now can do that: a single row that scrolls sideways, or a sidebar
  // column that scrolls vertically. Both shapes are pinned here.
  it('keeps the agent picker bounded instead of letting it wrap and grow', () => {
    sendMock.mockResolvedValue({ status: 'ok', entries: [], truncated: false });
    renderModal(makeTask());

    const chip = screen.getByText('Agent One').closest('button')!;
    const picker = chip.closest('[class*="sm:max-w-52"]') as HTMLElement;
    const scroller = chip.parentElement as HTMLElement;

    expect(picker.className).not.toContain('flex-wrap');
    // Stacked: the picker is a capped, vertically scrolling stack of phase rows,
    // and it is each row's agents that scroll sideways — not the picker itself,
    // so a phase's name stays put however far its agents are scrolled.
    expect(picker.className).toContain('max-h-32');
    expect(picker.className).toContain('overflow-y-auto');
    expect(scroller.className).toContain('overflow-x-auto');
  });

  // When the modal narrows, the transcript is the column worth keeping, since
  // it is what the reader opened the modal for. Which column gives way is
  // decided by which one carries `flex-1`: that column is sized from what is
  // left over, so it absorbs every change in the modal's width. Putting it on
  // the transcript is exactly what made the transcript shrink instead of the
  // picker, so the two columns' flex roles are pinned here.
  it('shrinks the picker, not the transcript, when the modal narrows', () => {
    sendMock.mockResolvedValue({ status: 'ok', entries: [], truncated: false });
    renderModal(makeTask());

    const picker = screen.getByText('Agent One').closest('[class*="sm:max-w-52"]') as HTMLElement;
    const transcript = picker.nextElementSibling as HTMLElement;

    // The picker takes the leftover width, bounded at both ends.
    expect(picker.className).toContain('sm:flex-1');
    expect(picker.className).toContain('sm:max-w-52');
    expect(picker.className).toContain('sm:min-w-28');

    // The transcript claims a width of its own instead of the leftovers, and
    // stays shrinkable for after the picker has bottomed out.
    expect(transcript.className).toContain('sm:max-w-xl');
    expect(transcript.className).toContain('sm:flex-initial');
    expect(transcript.className).not.toContain('sm:flex-1');
  });

  it('clamps the resized height to the configured min/max', () => {
    sendMock.mockResolvedValue({ status: 'ok', entries: [], truncated: false });
    renderModal(makeTask());

    const handle = screen.getByTitle('Drag to resize');
    const wrapper = handle.parentElement as HTMLElement;

    fireEvent.pointerDown(handle, { clientY: 500 });
    fireEvent.pointerMove(window, { clientY: -5000 }); // drag far above the top
    expect(wrapper.style.height).toBe('calc(-84px + 60vh)');
  });
});
