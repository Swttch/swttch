import { describe, it, expect, vi, beforeEach } from 'vitest';
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

vi.mock('@/contexts/WorkflowStateContext', () => ({
  useWorkflowState: () => ({
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
  }),
}));

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
});
