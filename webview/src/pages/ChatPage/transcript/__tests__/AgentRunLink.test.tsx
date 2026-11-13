import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { WorkflowTask } from '@/shared';
import type { ToolCall } from '../buildSegments';

// #673: the line over an agent call's detail that opens the agent's own run
// window. The shared state is stubbed; what is asked of it is the open call.
let tasks: Record<string, WorkflowTask> = {};
let provided = true;
const openTranscript = vi.fn();
vi.mock('@/contexts/WorkflowStateContext', () => ({
  useOptionalWorkflowState: () =>
    provided ? { getByToolUseId: (id: string) => tasks[id], openTranscript } : null,
}));

import { AgentRunLink } from '../TranscriptToolRun';

function task(overrides: Partial<WorkflowTask> = {}): WorkflowTask {
  return { toolUseId: 'toolu_a', taskId: 'a1b2c3', name: 'agent', status: 'running', startedAt: 0, phases: [], agents: [], ...overrides };
}

function callOf(input: Record<string, unknown>): ToolCall {
  return { toolUse: { id: 'toolu_a', name: 'Agent', input }, message: {} } as unknown as ToolCall;
}

beforeEach(() => {
  tasks = {};
  provided = true;
  openTranscript.mockClear();
});

describe('AgentRunLink', () => {
  it('says the agent is running and opens its run window when clicked', () => {
    tasks = { toolu_a: task() };
    render(<AgentRunLink call={callOf({ description: 'Create directory' })} />);

    expect(screen.getByText('Create directory')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('agent-run-link'));

    expect(openTranscript).toHaveBeenCalledWith('toolu_a');
  });

  it('words a running agent and a finished one differently, with the description in both', () => {
    tasks = { toolu_a: task({ status: 'running' }) };
    const first = render(<AgentRunLink call={callOf({ description: 'Create directory' })} />);
    const running = screen.getByTestId('agent-run-link').textContent ?? '';
    first.unmount();

    tasks = { toolu_a: task({ status: 'completed' }) };
    render(<AgentRunLink call={callOf({ description: 'Create directory' })} />);
    const finished = screen.getByTestId('agent-run-link').textContent ?? '';

    expect(running).toContain('Create directory');
    expect(finished).toContain('Create directory');
    expect(finished).not.toBe(running);
  });

  it('moves the light across the words only while the agent is running', () => {
    tasks = { toolu_a: task({ status: 'running' }) };
    const first = render(<AgentRunLink call={callOf({ description: 'x' })} />);
    expect(first.container.querySelector('.transcript-shimmer')).not.toBeNull();
    first.unmount();

    tasks = { toolu_a: task({ status: 'completed' }) };
    const second = render(<AgentRunLink call={callOf({ description: 'x' })} />);
    expect(second.container.querySelector('.transcript-shimmer')).toBeNull();
  });

  it('falls back to the task description, then its name, when the call gave none', () => {
    tasks = { toolu_a: task({ description: 'from the task' }) };
    const { unmount } = render(<AgentRunLink call={callOf({})} />);
    expect(screen.getByText('from the task')).toBeInTheDocument();
    unmount();

    tasks = { toolu_a: task({ name: 'named' }) };
    render(<AgentRunLink call={callOf({ description: '   ' })} />);
    expect(screen.getByText('named')).toBeInTheDocument();
  });

  it('draws nothing when the app is not tracking this call', () => {
    render(<AgentRunLink call={callOf({ description: 'x' })} />);
    expect(screen.queryByTestId('agent-run-link')).not.toBeInTheDocument();
  });

  // A cancelled agent's result names no agent id, so a reload rebuilds it with neither an id nor a file: there is
  // no transcript to open, and so no card.
  it('draws nothing for a task that has no agent id and no output file', () => {
    tasks = { toolu_a: task({ taskId: undefined, outputFile: undefined, status: 'failed' }) };
    render(<AgentRunLink call={callOf({ description: 'x' })} />);

    expect(screen.queryByTestId('agent-run-link')).not.toBeInTheDocument();
  });

  it('draws the card for a task that has an output file but no id, or an id but no file', () => {
    tasks = { toolu_a: task({ taskId: undefined, outputFile: '/tmp/tasks/a.output' }) };
    const first = render(<AgentRunLink call={callOf({ description: 'x' })} />);
    expect(screen.getByTestId('agent-run-link')).toBeInTheDocument();
    first.unmount();

    tasks = { toolu_a: task({ taskId: 'a1b2c3', outputFile: undefined }) };
    render(<AgentRunLink call={callOf({ description: 'x' })} />);
    expect(screen.getByTestId('agent-run-link')).toBeInTheDocument();
  });

  it('draws nothing where the window cannot be opened (no provider)', () => {
    provided = false;
    tasks = { toolu_a: task() };
    render(<AgentRunLink call={callOf({ description: 'x' })} />);
    expect(screen.queryByTestId('agent-run-link')).not.toBeInTheDocument();
  });
});
