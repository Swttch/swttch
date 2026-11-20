import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { WorkflowTask } from '@/shared';

const closePanelMock = vi.fn();
const cancelTaskMock = vi.fn();
const clearFinishedMock = vi.fn();
const dismissTaskMock = vi.fn();
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
      const [sideRunToolUseId, setSideRunToolUseId] = useState<string | null>(null);
      return {
        tasks: Object.values(tasksById),
        getByToolUseId: (id: string) => tasksById[id],
        runningTasks: Object.values(tasksById).filter((t) => t.status === 'running'),
        finishedTasks: Object.values(tasksById).filter((t) => t.status !== 'running'),
        clearFinished: clearFinishedMock,
        dismissTask: dismissTaskMock,
        panelOpen,
        openPanel: vi.fn(),
        closePanel: closePanelMock,
        focusedToolUseId: null,
        transcriptToolUseId,
        openTranscript: setTranscriptToolUseId,
        closeTranscript: () => setTranscriptToolUseId(null),
        sideRunToolUseId,
        openRunInSide: setSideRunToolUseId,
        closeRunInSide: () => setSideRunToolUseId(null),
        openRun: (id: string) =>
          tasksById[id]?.taskType === 'local_agent' ? setSideRunToolUseId(id) : setTranscriptToolUseId(id),
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

// The real run view pulls in the Bridge and more; what matters here is which buttons the panel hands it.
vi.mock('@/components/AgentTranscriptModal/SubagentRunView', () => ({
  SubagentRunView: (p: { task: WorkflowTask; onBack: () => void; onClose: () => void; onPlacementChange: (placement: 'side' | 'center' | 'page' | 'tab') => void; onOpenInNewTab: () => void }) => (
    <div data-testid="stub-run">
      <span>{p.task.name}</span>
      <button onClick={p.onBack}>stub-back</button>
      <button onClick={() => p.onPlacementChange('center')}>stub-modal</button>
      <button onClick={p.onClose}>stub-close-panel</button>
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

  describe('clearing what is finished', () => {
    it('is an icon in the header, named for what it clears, as the desktop app has it', () => {
      tasksById = { done: makeTask({ toolUseId: 'done', name: 'old task', status: 'completed' }) };
      render(<BackgroundTasksPanel />);

      fireEvent.click(screen.getByRole('button', { name: /clear finished tasks/i }));

      expect(clearFinishedMock).toHaveBeenCalledTimes(1);
      // No second, written-out button in the list.
      expect(screen.queryByText(/^clear$/i)).not.toBeInTheDocument();
    });

    it('is not there when nothing is finished', () => {
      tasksById = { t1: makeTask() };
      render(<BackgroundTasksPanel />);

      expect(screen.queryByRole('button', { name: /clear finished tasks/i })).not.toBeInTheDocument();
    });
  });

  describe('an agent in the list', () => {
    it('is one line with its name and how long it took; a command is a line too, a workflow a card', () => {
      tasksById = {
        a: makeTask({ toolUseId: 'a', name: 'stop agent', taskType: 'local_agent', status: 'completed', startedAt: 1000, endedAt: 32000, description: 'Agent finished' }),
        b: makeTask({ toolUseId: 'b', name: 'a script', taskType: 'local_bash', status: 'completed', startedAt: 1000, endedAt: 8000, description: 'Bash card text' }),
        w: makeTask({ toolUseId: 'w', name: 'a flow', taskType: 'local_workflow', status: 'completed', startedAt: 1000, endedAt: 66000, description: 'Flow card text' }),
      };
      render(<BackgroundTasksPanel />);
      const rows = screen.getAllByTestId('agent-task-row');
      expect(rows).toHaveLength(2);
      expect(rows[0].textContent).toContain('stop agent');
      expect(rows[0].textContent).not.toContain('Agent finished');
      expect(rows[1].textContent).toContain('a script');
      expect(rows[1].textContent).not.toContain('Bash card text');
      const card = screen.getByTestId('workflow-card');
      expect(card.textContent).toContain('a flow');
      expect(card.textContent).toContain('1m 5s');
      // A finished workflow does not repeat what it was asked to be.
      expect(card.textContent).not.toContain('Flow card text');
    });

    it('says a stopped agent was stopped, and a running one can be stopped from its line', () => {
      tasksById = {
        s: makeTask({ toolUseId: 's', name: 'was stopped', taskType: 'local_agent', status: 'stopped', startedAt: 1000, endedAt: 5000 }),
        r: makeTask({ toolUseId: 'r', name: 'still going', taskType: 'local_agent', status: 'running', startedAt: Date.now() - 5000 }),
      };
      render(<BackgroundTasksPanel />);
      const rows = screen.getAllByTestId('agent-task-row');
      const stopped = rows.find((r) => r.textContent?.includes('was stopped'))?.textContent ?? '';
      expect(stopped).toContain('Stopped');
      // The status, a dot, then the time at its right.
      expect(stopped).toMatch(/Stopped · 4s$/);
      fireEvent.click(screen.getByRole('button', { name: 'Cancel this task' }));
      expect(cancelTaskMock).toHaveBeenCalledWith(expect.objectContaining({ toolUseId: 'r' }));
    });
  });

  it('shows an agent\'s tokens beside its name', () => {
    tasksById = {
      a: makeTask({ toolUseId: 'a', name: 'counting', taskType: 'local_agent', status: 'completed', startedAt: 1000, endedAt: 3000, usage: { total_tokens: 81300 } }),
    };
    render(<BackgroundTasksPanel />);
    expect(screen.getByTestId('agent-task-row').textContent).toContain('81.3k tokens');
  });

  it('counts the agents done in a workflow\'s phase and opens it to their times', () => {
    tasksById = {
      w: makeTask({
        toolUseId: 'w',
        name: 'a flow',
        taskType: 'local_workflow',
        status: 'completed',
        startedAt: 1000,
        endedAt: 9000,
        phases: [{ title: 'Count' }],
        agents: [{ type: 'workflow_agent', index: 0, label: 'counter', state: 'done', durationMs: 7000 }],
      }),
    };
    render(<BackgroundTasksPanel />);
    const phase = screen.getByRole('button', { name: /Count/ });
    expect(phase.textContent).toContain('1/1');
    fireEvent.click(phase);
    expect(screen.getByTestId('workflow-card').textContent).toContain('counter');
  });

  it('takes a finished task out of the list from the X at the right of its time', () => {
    tasksById = { a: makeTask({ toolUseId: 'a', name: 'done agent', taskType: 'local_agent', status: 'completed', startedAt: 1000, endedAt: 3000 }) };
    dismissTaskMock.mockClear();
    render(<BackgroundTasksPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(dismissTaskMock).toHaveBeenCalledWith('a');
  });

  it('labels what is finished with its count and folds it from the label', () => {
    tasksById = { a: makeTask({ toolUseId: 'a', name: 'done agent', taskType: 'local_agent', status: 'completed', startedAt: 1000, endedAt: 3000 }) };
    render(<BackgroundTasksPanel />);
    const label = screen.getByRole('button', { name: /Finished 1/ });
    expect(label.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(label);
    expect(label.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByTestId('agent-task-row')).toBeNull();
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

  describe('a subagent run inside the panel', () => {
    beforeEach(() => {
      tasksById = { a: makeTask({ toolUseId: 'a', name: 'the agent', taskType: 'local_agent', status: 'running' }) };
    });

    it('takes the list\'s place when a subagent row is clicked, and back brings the list back', () => {
      render(<BackgroundTasksPanel />);
      fireEvent.click(screen.getByText('the agent'));
      expect(screen.getByTestId('stub-run')).toBeInTheDocument();
      expect(screen.queryByTestId('agent-task-row')).toBeNull();
      expect(screen.queryByTestId('stub-modal')).toBeNull();

      fireEvent.click(screen.getByText('stub-back'));
      expect(screen.queryByTestId('stub-run')).toBeNull();
      expect(screen.getByTestId('agent-task-row')).toBeInTheDocument();
    });

    it('moves into the window over the chat from its modal button, leaving the list', () => {
      render(<BackgroundTasksPanel />);
      fireEvent.click(screen.getByText('the agent'));
      fireEvent.click(screen.getByText('stub-modal'));
      expect(screen.queryByTestId('stub-run')).toBeNull();
      expect(screen.getByTestId('stub-modal')).toBeInTheDocument();
    });

    it('goes back one layer on Escape, and closes the panel from the list', () => {
      render(<BackgroundTasksPanel />);
      fireEvent.click(screen.getByText('the agent'));
      fireEvent.keyDown(screen.getByTestId('stub-run'), { key: 'Escape' });
      expect(screen.queryByTestId('stub-run')).toBeNull();
      expect(closePanelMock).not.toHaveBeenCalled();
      fireEvent.keyDown(screen.getByTestId('agent-task-row'), { key: 'Escape' });
      expect(closePanelMock).toHaveBeenCalledTimes(1);
    });

    it('closes the panel from the run\'s close button', () => {
      render(<BackgroundTasksPanel />);
      fireEvent.click(screen.getByText('the agent'));
      fireEvent.click(screen.getByText('stub-close-panel'));
      expect(closePanelMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('over the chat (a narrow window), where a press outside the panel closes it', () => {
    it('closes the panel on a press outside it', () => {
      render(<BackgroundTasksPanel />);
      fireEvent.mouseDown(document.body);
      expect(closePanelMock).toHaveBeenCalledTimes(1);
    });

    it('does not close it on a press on a menu of the run view, which is drawn outside the panel but is part of it', () => {
      // The More dropdown and the view options beside it are drawn into <body>. Closing the panel on the press
      // unmounted them before the click landed, so "View in center" never opened the window.
      render(<BackgroundTasksPanel />);
      const menu = document.createElement('div');
      menu.setAttribute('role', 'menu');
      const row = document.createElement('button');
      menu.appendChild(row);
      document.body.appendChild(menu);
      fireEvent.mouseDown(row);
      document.body.removeChild(menu);
      expect(closePanelMock).not.toHaveBeenCalled();
    });
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
