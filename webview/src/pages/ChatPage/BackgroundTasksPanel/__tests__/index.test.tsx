import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { WorkflowTask } from '@/shared';

const closePanelMock = vi.fn();
const cancelTaskMock = vi.fn();
let panelOpen = true;
let tasksById: Record<string, WorkflowTask> = {};

function makeTask(overrides: Partial<WorkflowTask> = {}): WorkflowTask {
  return {
    toolUseId: 't1',
    name: 'demo task',
    status: 'running',
    startedAt: 0,
    phases: [],
    agents: [],
    ...overrides,
  };
}

// The open run window lives in the shared state (so a card in the chat can open
// it), so the stand-in keeps it in state of its own, the way the real provider does.
vi.mock('@/contexts/WorkflowStateContext', async () => {
  const { useState } = await import('react');
  return {
    useWorkflowState: () => {
      const [transcriptToolUseId, setTranscriptToolUseId] = useState<string | null>(null);
      return {
        tasks: Object.values(tasksById),
        getByToolUseId: (id: string) => tasksById[id],
        runningTasks: Object.values(tasksById).filter((t) => t.status === 'running'),
        finishedTasks: Object.values(tasksById).filter((t) => t.status !== 'running'),
        clearFinished: vi.fn(),
        dismissTask: vi.fn(),
        panelOpen,
        openPanel: vi.fn(),
        closePanel: closePanelMock,
        focusedToolUseId: null,
        transcriptToolUseId,
        openTranscript: setTranscriptToolUseId,
        closeTranscript: () => setTranscriptToolUseId(null),
      };
    },
  };
});

vi.mock('@/hooks/useBackgroundTaskActions', () => ({
  useBackgroundTaskActions: () => ({ cancelTask: cancelTaskMock }),
}));

// The real modal pulls in Bridge/react-query/CliConfig — irrelevant to this
// panel's own outside-click behavior, so a minimal stub stands in for it.
// Its "Cancel this task" button is the concrete case this test guards: a
// click on it must not also close the panel behind it (the modal is this
// component's own child, so closing the panel would unmount the modal too).
vi.mock('@/components/AgentTranscriptModal', () => ({
  AgentTranscriptModal: ({ onClose }: { task: WorkflowTask; onClose: () => void }) => (
    <div data-testid="stub-modal">
      <button onClick={onClose}>stub-close</button>
      <button>Cancel this task</button>
    </div>
  ),
}));

import { act } from '@testing-library/react';
import { filePreviewPaneStore } from '@/utils/filePreviewPaneStore';
import { BackgroundTasksPanel } from '../index';

describe('BackgroundTasksPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    panelOpen = true;
    tasksById = { t1: makeTask() };
  });

  it('closes the panel on an outside click', () => {
    render(<BackgroundTasksPanel />);

    fireEvent.mouseDown(document.body);

    expect(closePanelMock).toHaveBeenCalledTimes(1);
  });

  it('does not close the panel on a click inside it', () => {
    render(<BackgroundTasksPanel />);

    fireEvent.mouseDown(screen.getByText('demo task'));

    expect(closePanelMock).not.toHaveBeenCalled();
  });

  it('does not close the panel on a click inside the open transcript modal', () => {
    render(<BackgroundTasksPanel />);

    fireEvent.click(screen.getByText('demo task'));
    expect(screen.getByTestId('stub-modal')).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByText('Cancel this task'));

    expect(closePanelMock).not.toHaveBeenCalled();
  });

  describe('as a column beside the chat (a wide window)', () => {
    beforeEach(() => {
      window.matchMedia = ((query: string) => ({
        matches: true, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn(),
      })) as unknown as typeof window.matchMedia;
    });
    afterEach(() => {
      // @ts-expect-error back to the DOM without media queries
      delete window.matchMedia;
    });

    it('does not close the panel on a click outside it, since the chat beside it stays usable', () => {
      render(<BackgroundTasksPanel />);

      fireEvent.mouseDown(document.body);

      expect(closePanelMock).not.toHaveBeenCalled();
    });

    it('keeps no shadow over the chat', () => {
      render(<BackgroundTasksPanel />);

      expect(screen.getByText('demo task').closest('[tabindex="-1"]')?.className).not.toContain('shadow-2xl');
    });
  });

  describe('with the preview pane', () => {
    afterEach(() => filePreviewPaneStore.close());

    it('closes the preview pane when the panel is open', () => {
      filePreviewPaneStore.open('/a.txt');
      render(<BackgroundTasksPanel />);

      expect(filePreviewPaneStore.get()).toBeNull();
    });

    it('closes the panel when a file is opened in the preview pane meanwhile', () => {
      render(<BackgroundTasksPanel />);

      act(() => filePreviewPaneStore.open('/a.txt'));

      expect(closePanelMock).toHaveBeenCalledTimes(1);
    });
  });
});
