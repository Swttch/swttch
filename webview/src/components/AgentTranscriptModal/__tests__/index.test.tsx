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

import { AgentTranscriptModal } from '../index';

function makeTask(overrides: Partial<WorkflowTask> = {}): WorkflowTask {
  return {
    toolUseId: 'toolu_1',
    transcriptDir: '/wf/dir',
    name: 'demo-workflow',
    status: 'completed',
    startedAt: 0,
    phases: [],
    agents: [
      { agentId: 'a1', label: 'Agent One', status: 'done', tokens: 100, tools: 2, durationMs: 5000 },
      { agentId: 'a2', label: 'Agent Two', status: 'running', tokens: 50, tools: 1, durationMs: 3000 },
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

    fireEvent.click(screen.getByTitle('Agent Two'));

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
