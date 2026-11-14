import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TranscriptBackgroundWorking } from '../TranscriptBackgroundWorking';

// #673: the end of the chat says work is going on while the turn is over and a background task still runs.
let runningTasks: Array<{ startedAt: number }> = [];
vi.mock('@/contexts/WorkflowStateContext', () => ({
  useOptionalWorkflowState: () => ({ runningTasks }),
}));

beforeEach(() => {
  runningTasks = [];
});

describe('TranscriptBackgroundWorking', () => {
  it('draws the working mark and the time of the longest-running task', () => {
    runningTasks = [{ startedAt: Date.now() - 20_000 }, { startedAt: Date.now() - 5_000 }];
    render(<TranscriptBackgroundWorking hidden={false} />);

    const line = screen.getByRole('status');
    expect(line).toHaveTextContent('20s');
    expect(line.querySelector('svg')).not.toBeNull();
  });

  it('draws nothing when no task runs', () => {
    render(<TranscriptBackgroundWorking hidden={false} />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('draws nothing while a permission card waits for the person', () => {
    runningTasks = [{ startedAt: Date.now() - 20_000 }];
    render(<TranscriptBackgroundWorking hidden />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('ignores a task whose start is not known', () => {
    runningTasks = [{ startedAt: 0 }];
    render(<TranscriptBackgroundWorking hidden={false} />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
