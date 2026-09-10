import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient } from '@/hooks/queries/__tests__/testQueryClient';
import type { WorkflowAgent } from '@/shared';

const sendMock = vi.fn();
vi.mock('@/hooks/useBridge', () => ({
  useBridge: () => ({ send: sendMock }),
}));

import { AgentDetailHeader } from '../AgentDetailHeader';

// The CLI's own entry for a finished agent.
function makeAgent(overrides: Partial<WorkflowAgent> = {}): WorkflowAgent {
  return {
    type: 'workflow_agent',
    index: 1,
    agentId: 'a1',
    label: 'probe:survivor-0',
    phaseTitle: 'Probe',
    state: 'done',
    model: 'claude-haiku-4-5-20251001',
    promptPreview: 'Reply with exactly the number 0.',
    queuedAt: 1_000_000,
    startedAt: 1_000_003,
    attempt: 1,
    tokens: 51389,
    toolCalls: 0,
    durationMs: 18740,
    resultPreview: '0',
    ...overrides,
  };
}

// One assistant turn whose usage is almost entirely cache reads, as a subagent's
// really is: 10 new input tokens against 51165 read back from cache.
const usageEntries = [
  {
    type: 'assistant',
    message: {
      usage: {
        input_tokens: 10,
        cache_creation_input_tokens: 212,
        cache_read_input_tokens: 51165,
        output_tokens: 73,
      },
    },
  },
];

function renderHeader(agent: WorkflowAgent) {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <AgentDetailHeader agent={agent} transcriptDir="/wf/dir" />
    </QueryClientProvider>,
  );
}

describe('AgentDetailHeader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendMock.mockResolvedValue({ status: 'ok', entries: usageEntries, truncated: false });
  });

  // The picker already carries the name, phase, status, tokens and duration, and
  // the transcript below opens with the prompt itself. Repeating any of it here
  // would cost space the unseen fields need.
  it('shows what nothing else shows: model, tool calls and the queue wait', async () => {
    renderHeader(makeAgent());

    await waitFor(() => expect(screen.getByText(/claude-haiku-4-5-20251001/)).toBeInTheDocument());
    const meta = screen.getByText(/claude-haiku-4-5-20251001/).textContent!;
    expect(meta).toContain('0'); // toolCalls
    expect(meta).toContain('3ms'); // startedAt - queuedAt, which formatDuration would round to 0s
  });

  // A first attempt is the normal case and says nothing.
  it('mentions the attempt only when the agent was retried', async () => {
    const { rerender } = renderHeader(makeAgent({ attempt: 1 }));
    await waitFor(() => expect(screen.getByText(/claude-haiku/)).toBeInTheDocument());
    expect(screen.getByText(/claude-haiku/).textContent).not.toMatch(/attempt|회차/i);

    rerender(
      <QueryClientProvider client={createTestQueryClient()}>
        <AgentDetailHeader agent={makeAgent({ attempt: 3 })} transcriptDir="/wf/dir" />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByText(/claude-haiku/).textContent).toMatch(/3/));
  });

  // 51.5k on the chip is 10 new tokens and 51165 read back from cache, so the
  // figure alone reads as a cost it is not. This is the only place that says so.
  it('breaks the token figure down into what it is made of', async () => {
    renderHeader(makeAgent());

    await waitFor(() => expect(screen.getByText(/51.5k/)).toBeInTheDocument());
    const line = screen.getByText(/51.5k/).textContent!;
    expect(line).toContain('10'); // input
    expect(line).toContain('212'); // cache written
    expect(line).toContain('51.2k'); // cache read
    expect(line).toContain('73'); // output
  });

  it('shows what the agent handed back', async () => {
    renderHeader(makeAgent({ resultPreview: 'entity-count=90' }));

    await waitFor(() => expect(screen.getByText(/entity-count=90/)).toBeInTheDocument());
  });

  it('shows why a failed agent failed', async () => {
    renderHeader(makeAgent({ state: 'error', error: 'subagent exited before replying' }));

    await waitFor(() => expect(screen.getByText('subagent exited before replying')).toBeInTheDocument());
  });

  // An agent rebuilt from disk has none of these fields, because the CLI
  // persists none of them. An empty bar of separators would be worse than none.
  it('renders nothing when the CLI reported none of this', () => {
    const { container } = render(
      <QueryClientProvider client={createTestQueryClient()}>
        <AgentDetailHeader agent={{ agentId: 'a1', reconstructed: true }} transcriptDir={undefined} />
      </QueryClientProvider>,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
