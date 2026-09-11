import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient } from '@/hooks/queries/__tests__/testQueryClient';
import type { WorkflowAgent } from '@/shared';

const sendMock = vi.fn();
vi.mock('@/hooks/useBridge', () => ({
  useBridge: () => ({ send: sendMock }),
}));

import { DetailHeader } from '../AgentDetailHeader';

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

function renderHeader(agent: WorkflowAgent, transcriptDir: string | undefined = '/wf/dir') {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <DetailHeader source={agent} transcriptDir={transcriptDir} />
    </QueryClientProvider>,
  );
}

describe('AgentDetailHeader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendMock.mockResolvedValue({ status: 'ok', entries: usageEntries, truncated: false });
  });

  // An agent is a question and an answer. The transcript below auto-scrolls to
  // the end, so the prompt has scrolled off by the time the modal opens, and
  // the returned value is a separate thing from whatever it said last.
  it('leads with what the agent was asked and what it returned', () => {
    renderHeader(makeAgent());

    expect(screen.getByText('Prompt')).toBeInTheDocument();
    expect(screen.getByText('Reply with exactly the number 0.')).toBeInTheDocument();
    expect(screen.getByText('Result')).toBeInTheDocument();
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  // Model, tool calls, queue wait, retry and the token split are occasionally
  // useful and never urgent, so they hang off the badge rather than taking a
  // line each. The badge says only which model ran.
  it('keeps the rest behind one badge instead of listing it', async () => {
    renderHeader(makeAgent());

    expect(screen.getByText('haiku 4.5')).toBeInTheDocument();
    // Closed, none of the metadata is on screen.
    await waitFor(() => expect(screen.queryByText(/claude-haiku-4-5-20251001/)).not.toBeInTheDocument());
    expect(screen.queryByText(/51\.5k/)).not.toBeInTheDocument();
  });

  // A failure is the one thing here that must not be a hover away.
  it('shows a failure in the open, not behind the badge', () => {
    renderHeader(makeAgent({ state: 'error', error: 'subagent exited before replying' }));

    expect(screen.getByText('subagent exited before replying')).toBeInTheDocument();
  });

  it('shows only the half the CLI reported', () => {
    renderHeader(makeAgent({ resultPreview: undefined }));

    expect(screen.getByText('Prompt')).toBeInTheDocument();
    expect(screen.queryByText('Result')).not.toBeInTheDocument();
  });

  // An agent rebuilt from disk has none of these fields, because the CLI
  // persists none of them. An empty row of labels would be worse than none.
  it('renders nothing when the CLI reported none of this', () => {
    const { container } = renderHeader({ agentId: 'a1', reconstructed: true }, undefined);

    expect(container).toBeEmptyDOMElement();
  });
});
