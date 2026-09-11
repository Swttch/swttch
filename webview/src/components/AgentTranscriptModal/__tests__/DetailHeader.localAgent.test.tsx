import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { WorkflowTask } from '@/shared';
import { DetailHeader } from '../AgentDetailHeader';

function makeTask(overrides: Partial<WorkflowTask> = {}): WorkflowTask {
  return {
    toolUseId: 'toolu_a',
    taskType: 'local_agent',
    name: 'Describe webview utils dir',
    status: 'completed',
    startedAt: 0,
    phases: [],
    agents: [],
    ...overrides,
  };
}

describe('DetailHeader, given a backgrounded Agent task', () => {
  // Live: the prompt rides on task_started and the returned value on the
  // notification's `summary`.
  it('reads the prompt and the returned value from the live events', () => {
    render(
      <DetailHeader
        source={makeTask({
          summary: 'done',
          events: { task_started: [{ prompt: 'sleep 90 using Bash, then reply done' }] },
        })}
      />,
    );

    expect(screen.getByText('sleep 90 using Bash, then reply done')).toBeInTheDocument();
    expect(screen.getByText('done')).toBeInTheDocument();
  });

  // Reload: the CLI persists no events, so the prompt is only on the tool call
  // that launched the task, and the envelope puts the returned value in
  // `result` while `summary` becomes a sentence about the agent, not from it.
  it('reads them from the tool call and `result` after a reload', () => {
    render(
      <DetailHeader
        source={makeTask({
          summary: 'Agent "Describe webview utils dir" finished',
          result: 'Complete.',
          events: { tool_use: { name: 'Agent', input: { prompt: 'Read every .ts file…' } } },
        })}
      />,
    );

    expect(screen.getByText('Read every .ts file…')).toBeInTheDocument();
    expect(screen.getByText('Complete.')).toBeInTheDocument();
    // The sentence about the agent belongs to the summary line above the
    // header, not here — this row is what the agent returned.
    expect(screen.queryByText(/finished/)).not.toBeInTheDocument();
  });

  // Which kind of agent ran belongs on the task's own meta line, beside the
  // status and the duration — not in here, which is about the exchange.
  it('leaves the subagent type to the summary line above it', () => {
    render(
      <DetailHeader
        source={makeTask({
          summary: 'done',
          events: { task_started: [{ prompt: 'go', subagent_type: 'general-purpose' }] },
        })}
      />,
    );

    expect(screen.queryByText('general-purpose')).not.toBeInTheDocument();
  });

  // No event reports the model; only the call that asked for one does.
  it('badges the model when the call named one', () => {
    render(
      <DetailHeader
        source={makeTask({
          summary: 'done',
          events: {
            task_started: [{ prompt: 'go', subagent_type: 'general-purpose' }],
            tool_use: { name: 'Agent', input: { model: 'opus' } },
          },
        })}
      />,
    );

    expect(screen.getByText('opus')).toBeInTheDocument();
  });

  // Most calls name no model and inherit the session's, which is not ours to
  // guess at — so there is simply no badge, and nothing stands in for one.
  it('shows no badge when the call named no model', () => {
    const { container } = render(
      <DetailHeader
        source={makeTask({
          summary: 'done',
          events: { task_started: [{ prompt: 'go', subagent_type: 'general-purpose' }] },
        })}
      />,
    );

    expect(container.querySelector('.bg-surface-hover')).toBeNull();
  });

  // Nothing to say yet is better said with nothing at all: an empty row of
  // labels reads as a header that failed to render.
  it('renders nothing when the task carries none of it', () => {
    const { container } = render(<DetailHeader source={makeTask()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
