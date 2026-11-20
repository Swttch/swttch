import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { WorkflowStateProvider, useWorkflowState } from '../WorkflowStateContext';
import type { WorkflowTask } from '@/shared';

// Capture the WORKFLOW_PROGRESS subscriber so tests can push backend updates.
let capturedHandler: ((msg: { payload: unknown }) => void) | null = null;
const mockSubscribe = vi.fn((_type: string, cb: (msg: { payload: unknown }) => void) => {
  capturedHandler = cb;
  return vi.fn();
});

vi.mock('../BridgeContext', () => ({
  useBridgeContext: () => ({ subscribe: mockSubscribe, isConnected: true }),
}));

let mockSessionId: string | null = 's1';
vi.mock('../SessionContext', () => ({
  useSessionContext: () => ({ currentSessionId: mockSessionId }),
}));

// The place pinned as the default for the project, which is where a run opens when it is clicked.
let mockPinned: string | null = null;
vi.mock('../SettingsContext', () => ({
  useSettingsOrNull: () => ({ settings: { runViewPlacement: mockPinned } }),
}));

let ctx: ReturnType<typeof useWorkflowState>;
function Harness() {
  ctx = useWorkflowState();
  return null;
}

function emit(task: Partial<WorkflowTask> & Pick<WorkflowTask, 'toolUseId'>) {
  act(() => {
    capturedHandler?.({
      payload: { name: 'wf', status: 'running', startedAt: 0, phases: [], agents: [], ...task },
    });
  });
}

beforeEach(() => {
  capturedHandler = null;
  mockSessionId = 's1';
  mockPinned = null;
  render(
    <WorkflowStateProvider>
      <Harness />
    </WorkflowStateProvider>,
  );
});

describe('WorkflowStateContext', () => {
  it('ingests WORKFLOW_PROGRESS into the task list keyed by toolUseId', () => {
    emit({ toolUseId: 't1' });
    expect(ctx.tasks).toHaveLength(1);
    // A later update for the same id replaces (not duplicates) the task.
    emit({ toolUseId: 't1', status: 'completed' });
    expect(ctx.tasks).toHaveLength(1);
    expect(ctx.finishedTasks).toHaveLength(1);
    expect(ctx.runningTasks).toHaveLength(0);
  });

  it('lists the running tasks by when they started and the finished ones by when they ended, the newest first, as the desktop app does', () => {
    // Three tasks started at once, in this order; the Bash one took longest, so it ended last.
    emit({ toolUseId: 'agent', status: 'completed', startedAt: 1000, endedAt: 25_000 });
    emit({ toolUseId: 'bash', status: 'completed', startedAt: 1100, endedAt: 61_000 });
    emit({ toolUseId: 'workflow', status: 'completed', startedAt: 4000, endedAt: 26_000 });
    emit({ toolUseId: 'run-old', status: 'running', startedAt: 90_000 });
    emit({ toolUseId: 'run-new', status: 'running', startedAt: 95_000 });

    expect(ctx.finishedTasks.map((t) => t.toolUseId)).toEqual(['bash', 'workflow', 'agent']);
    expect(ctx.runningTasks.map((t) => t.toolUseId)).toEqual(['run-new', 'run-old']);
    // The running ones are above the finished ones.
    expect(ctx.tasks.map((t) => t.toolUseId)).toEqual(['run-new', 'run-old', 'bash', 'workflow', 'agent']);
  });

  it('takes the start for the end of a finished task that has none (one stopped without a notice)', () => {
    emit({ toolUseId: 'stopped', status: 'stopped', startedAt: 5000 });
    emit({ toolUseId: 'done', status: 'completed', startedAt: 1000, endedAt: 3000 });

    expect(ctx.finishedTasks.map((t) => t.toolUseId)).toEqual(['stopped', 'done']);
  });

  it('puts a task with no times (one rebuilt after a reload) after the ones that have them, the latest arrival first', () => {
    emit({ toolUseId: 'a', status: 'completed', startedAt: 0 });
    emit({ toolUseId: 'b', status: 'completed', startedAt: 0 });
    emit({ toolUseId: 'c', status: 'completed', startedAt: 500 });

    expect(ctx.finishedTasks.map((t) => t.toolUseId)).toEqual(['c', 'b', 'a']);
  });

  it('dismissTask hides a workflow from the panel but keeps it for the inline card', () => {
    emit({ toolUseId: 't1', status: 'stopped' });
    emit({ toolUseId: 't2', status: 'completed' });
    expect(ctx.tasks).toHaveLength(2);

    act(() => ctx.dismissTask('t1'));
    // Gone from the panel list…
    expect(ctx.tasks.map((t) => t.toolUseId)).toEqual(['t2']);
    // …but still resolvable for the inline chat card, with its real status
    // (so it does NOT fall back to "running").
    expect(ctx.getByToolUseId('t1')?.status).toBe('stopped');
  });

  it('clearFinished hides finished workflows from the panel, inline cards keep status', () => {
    emit({ toolUseId: 't1', status: 'running' });
    emit({ toolUseId: 't2', status: 'completed' });
    emit({ toolUseId: 't3', status: 'stopped' });

    act(() => ctx.clearFinished());
    expect(ctx.tasks.map((t) => t.toolUseId)).toEqual(['t1']);
    expect(ctx.getByToolUseId('t2')?.status).toBe('completed');
    expect(ctx.getByToolUseId('t3')?.status).toBe('stopped');
  });

  // #673: a card in the chat opens a task's run window without the panel.
  it('opens and closes a task run window on its own, with the panel shut', () => {
    emit({ toolUseId: 't1' });
    expect(ctx.transcriptToolUseId).toBeNull();

    act(() => ctx.openTranscript('t1'));
    expect(ctx.transcriptToolUseId).toBe('t1');
    expect(ctx.panelOpen).toBe(false);

    act(() => ctx.closeTranscript());
    expect(ctx.transcriptToolUseId).toBeNull();
  });

  // #667: a run opens inside the panel, whatever it is; one the app does not track falls back to the window.
  it('opens an agent, a workflow and a command in the panel, and closing the panel ends the run view', () => {
    emit({ toolUseId: 'a', taskType: 'local_agent' });
    emit({ toolUseId: 'w', taskType: 'local_workflow' });
    emit({ toolUseId: 'b', taskType: 'local_bash' });

    act(() => ctx.openRun('a'));
    expect(ctx.sideRunToolUseId).toBe('a');
    expect(ctx.panelOpen).toBe(true);
    expect(ctx.transcriptToolUseId).toBeNull();

    act(() => ctx.closeRunInSide());
    expect(ctx.sideRunToolUseId).toBeNull();
    expect(ctx.panelOpen).toBe(true);

    act(() => ctx.openRun('w'));
    expect(ctx.sideRunToolUseId).toBe('w');
    expect(ctx.transcriptToolUseId).toBeNull();

    act(() => ctx.openRun('b'));
    expect(ctx.sideRunToolUseId).toBe('b');

    act(() => ctx.openRun('unknown'));
    expect(ctx.transcriptToolUseId).toBe('unknown');

    act(() => ctx.openRun('a'));
    act(() => ctx.closePanel());
    expect(ctx.sideRunToolUseId).toBeNull();
  });

  // The pin on a row of the view options menu: where a click on a run opens it.
  it('opens a run in the window when "View in center" is the pinned default, and beside the chat for any other pin', () => {
    const open = (pinned: string | null) => {
      mockPinned = pinned;
      render(
        <WorkflowStateProvider>
          <Harness />
        </WorkflowStateProvider>,
      );
      emit({ toolUseId: 'a', taskType: 'local_agent' });
      act(() => ctx.openRun('a'));
      return { side: ctx.sideRunToolUseId, window: ctx.transcriptToolUseId };
    };

    expect(open('center')).toEqual({ side: null, window: 'a' });
    // The page and the tab are not built yet, so those pins open beside the chat, as no pin does.
    expect(open('page')).toEqual({ side: 'a', window: null });
    expect(open('tab')).toEqual({ side: 'a', window: null });
    expect(open('side')).toEqual({ side: 'a', window: null });
    expect(open(null)).toEqual({ side: 'a', window: null });
  });
});
