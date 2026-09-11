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
