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
});
