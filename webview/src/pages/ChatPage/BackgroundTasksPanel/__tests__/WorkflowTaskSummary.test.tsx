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
    usage: { agentCount: 1, subagentTokens: 1500, toolUses: 3, durationMs: 4200 },
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
