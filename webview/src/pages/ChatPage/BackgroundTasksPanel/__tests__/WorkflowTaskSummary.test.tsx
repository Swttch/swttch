import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { WorkflowTask } from '@/shared';
import { WorkflowTaskSummary, WorkflowAgentsTable } from '../WorkflowTaskSummary';

function makeTask(overrides: Partial<WorkflowTask> = {}): WorkflowTask {
  return {
    toolUseId: 'toolu_1',
    name: 'demo-flow',
    status: 'completed',
    startedAt: 0,
    phases: [{ title: 'Explore' }],
    agents: [{ agentId: 'a1', label: 'Agent One', status: 'done', tokens: 1500, tools: 3, durationMs: 4200 }],
    // The CLI's own field names — the envelope's spelling, which is what a
    // reloaded task carries.
    usage: { agent_count: 1, subagent_tokens: 1500, tool_uses: 3, duration_ms: 4200 },
    ...overrides,
  };
}

describe('WorkflowTaskSummary', () => {
  it('shows status, workflow label, agent count, tokens, and duration', () => {
    render(<WorkflowTaskSummary task={makeTask()} now={0} />);

    expect(screen.getByText('completed')).toBeInTheDocument();
    expect(screen.getByText('Workflow')).toBeInTheDocument();
    expect(screen.getByText('1 agent')).toBeInTheDocument();
  });

  it('shows the Bash label instead of Workflow for a local_bash task', () => {
    render(<WorkflowTaskSummary task={makeTask({ taskType: 'local_bash', agents: [], usage: undefined })} now={0} />);
    expect(screen.getByText('Bash')).toBeInTheDocument();
    expect(screen.queryByText('Workflow')).not.toBeInTheDocument();
  });

  it('shows the description when present', () => {
    render(<WorkflowTaskSummary task={makeTask({ description: 'Read two files in parallel' })} now={0} />);
    expect(screen.getByText('Read two files in parallel')).toBeInTheDocument();
  });

  it('shows the token total whichever name the CLI used for it', () => {
    const { rerender } = render(
      <WorkflowTaskSummary task={makeTask({ agents: [], usage: { subagent_tokens: 1500 } })} now={0} />,
    );
    expect(screen.getByText('1.5k tokens')).toBeInTheDocument();

    rerender(<WorkflowTaskSummary task={makeTask({ agents: [], usage: { total_tokens: 2500 } })} now={0} />);
    expect(screen.getByText('2.5k tokens')).toBeInTheDocument();
  });

  it('shows phases by default and hides them when showPhases is false', () => {
    const { rerender } = render(<WorkflowTaskSummary task={makeTask()} now={0} />);
    expect(screen.getByText('Explore')).toBeInTheDocument();

    rerender(<WorkflowTaskSummary task={makeTask()} now={0} showPhases={false} />);
    expect(screen.queryByText('Explore')).not.toBeInTheDocument();
  });
});

// #673: a running task's elapsed time follows the clock. The CLI's own figure is
// the one from its last progress event, so it stops at "2s" while the agent
// waits on a permission answer and the row beside it counts on.
describe('WorkflowTaskSummary: the elapsed time of a running task', () => {
  const running = (overrides: Partial<WorkflowTask> = {}) =>
    makeTask({ status: 'running', startedAt: 1_000_000, usage: { duration_ms: 2000 }, agents: [], ...overrides });

  it('counts from the start time, not from the last figure the CLI sent', () => {
    render(<WorkflowTaskSummary task={running()} now={1_000_000 + 21_000} />);

    expect(screen.getByText(/21s/)).toBeInTheDocument();
    expect(screen.queryByText(/\b2s\b/)).not.toBeInTheDocument();
  });

  it('keeps counting as the clock moves', () => {
    const { rerender } = render(<WorkflowTaskSummary task={running()} now={1_000_000 + 21_000} />);
    rerender(<WorkflowTaskSummary task={running()} now={1_000_000 + 33_000} />);

    expect(screen.getByText(/33s/)).toBeInTheDocument();
  });

  it('uses the span between start and end for a task that was cancelled, whose usage is stale', () => {
    render(
      <WorkflowTaskSummary
        task={running({ status: 'stopped', endedAt: 1_000_000 + 25_000, usage: { duration_ms: 2000 } })}
        now={1_000_000 + 90_000}
      />,
    );

    expect(screen.getByText(/25s/)).toBeInTheDocument();
    expect(screen.queryByText(/\b2s\b/)).not.toBeInTheDocument();
  });

  // The notification of a cancelled task is as the CLI sent it: "stopped", with no usage.
  it('uses the span when the closing notification carried no usage', () => {
    render(
      <WorkflowTaskSummary
        task={running({
          status: 'stopped',
          endedAt: 1_000_000 + 15_000,
          usage: { duration_ms: 1590 },
          events: { task_notification: { status: 'stopped' } },
        })}
        now={1_000_000 + 90_000}
      />,
    );

    expect(screen.getByText(/15s/)).toBeInTheDocument();
  });

  it('keeps the CLI figure when its closing notification carried one', () => {
    render(
      <WorkflowTaskSummary
        task={running({
          status: 'completed',
          endedAt: 1_000_000 + 30_000,
          usage: { duration_ms: 20_652 },
          events: { task_notification: { status: 'completed', usage: { duration_ms: 20_652 } } },
        })}
        now={1_000_000 + 90_000}
      />,
    );

    expect(screen.getByText(/21s/)).toBeInTheDocument();
  });

  it('falls back to the CLI figure when the start time is unknown', () => {
    render(<WorkflowTaskSummary task={running({ startedAt: 0 })} now={1_789_000_000_000} />);

    expect(screen.getByText(/2s/)).toBeInTheDocument();
  });
});

describe('WorkflowAgentsTable', () => {
  it('renders one row per agent with its stats', () => {
    render(<WorkflowAgentsTable task={makeTask()} />);
    expect(screen.getByText('Agent One')).toBeInTheDocument();
  });

  it('renders nothing when there are no agents', () => {
    const { container } = render(<WorkflowAgentsTable task={makeTask({ agents: [] })} />);
    expect(container.firstChild).toBeNull();
  });
});

// Which kind of agent ran sits on the meta line beside the status, tokens and
// duration. Only a backgrounded Agent/Task has one.
describe('WorkflowTaskSummary: the subagent type', () => {
  it('shows it after the duration, from the live event', () => {
    render(
      <WorkflowTaskSummary
        task={makeTask({
          taskType: 'local_agent',
          agents: [],
          events: { task_started: [{ subagent_type: 'general-purpose' }] },
        })}
        now={0}
      />,
    );

    expect(screen.getByText('general-purpose')).toBeInTheDocument();
  });

  // After a reload the CLI has persisted no events, so the launching call is
  // the only place it is still stated.
  it('falls back to the launching tool call after a reload', () => {
    render(
      <WorkflowTaskSummary
        task={makeTask({
          taskType: 'local_agent',
          agents: [],
          events: { tool_use: { name: 'Agent', input: { subagent_type: 'explore' } } },
        })}
        now={0}
      />,
    );

    expect(screen.getByText('explore')).toBeInTheDocument();
  });

  it('shows nothing for a workflow, which has no subagent type', () => {
    const { container } = render(<WorkflowTaskSummary task={makeTask()} now={0} />);
    expect(container.textContent).not.toContain('general-purpose');
  });
});
