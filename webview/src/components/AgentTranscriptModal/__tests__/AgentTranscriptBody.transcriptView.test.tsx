import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient } from '@/hooks/queries/__tests__/testQueryClient';
import type { WorkflowAgent } from '@/shared';

const sendMock = vi.fn();
vi.mock('@/hooks/useBridge', () => ({ useBridge: () => ({ send: sendMock, sendRaw: vi.fn(), subscribe: vi.fn(() => vi.fn()) }) }));
vi.mock('@/contexts/CliConfigContext', () => ({
  useCliConfig: () => ({ controlResponse: null, isLoading: false, refresh: vi.fn() }),
}));
vi.mock('@/contexts/SettingsContext', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/contexts/SettingsContext')>()),
  useSettings: () => ({ settings: {} }),
}));
vi.mock('@/hooks/useReadAloud', () => ({ useReadAloud: () => ({ status: 'idle', toggle: vi.fn(), stop: vi.fn() }) }));

// The view mode the chat is in, set per test. Only this one export is replaced.
let mode: 'normal' | null = 'normal';
vi.mock('@/pages/ChatPage/message-renderers/transcriptViewMode', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/pages/ChatPage/message-renderers/transcriptViewMode')>()),
  useTranscriptViewMode: () => mode,
}));

import { AgentTranscriptBody } from '../AgentTranscriptBody';
import { MessageType } from '@/shared';

const agent: WorkflowAgent = { type: 'workflow_agent', index: 1, agentId: 'a1', label: 'explore:Agent One', state: 'done', tokens: 1, toolCalls: 0, durationMs: 1 };

const entries = [
  { parentUuid: null, isSidechain: true, type: 'user', uuid: 'u1', message: { role: 'user', content: 'list the headings' } },
  { type: 'assistant', uuid: 'a1', message: { role: 'assistant', model: 'claude-haiku-5-5', content: [{ type: 'text', text: 'There is one heading' }] } },
];

function renderBody(reply: { entries: object[]; truncated: boolean }) {
  sendMock.mockResolvedValue({ status: 'ok', ...reply });
  const client = createTestQueryClient();
  return render(
    <QueryClientProvider client={client}>
      <AgentTranscriptBody transcriptDir="/dir" agent={agent} taskStatus="completed" sendCount={0} />
    </QueryClientProvider>,
  );
}

describe('AgentTranscriptBody (a workflow agent) in the chat view modes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('draws the Transcript view, with the prompt as a bubble and the model under it, when the chat is in one', async () => {
    mode = 'normal';
    renderBody({ entries, truncated: false });

    await waitFor(() => expect(screen.getByText('There is one heading')).toBeInTheDocument());
    expect(screen.getByText('list the headings')).toBeInTheDocument();
    expect(screen.getByText(/Model Haiku 5\.5/)).toBeInTheDocument();
    expect(document.querySelector('[data-seg="blocks"]')).toBeInTheDocument();
  });

  it('keeps drawing the classic bubbles when the chat is classic', async () => {
    mode = null;
    renderBody({ entries, truncated: false });

    await waitFor(() => expect(screen.getByText('There is one heading')).toBeInTheDocument());
    expect(document.querySelector('[data-seg="blocks"]')).not.toBeInTheDocument();
    expect(screen.queryByText(/Model Haiku/)).not.toBeInTheDocument();
  });

  it('asks for the page before, which is a larger window of the transcript, from the button on top', async () => {
    mode = 'normal';
    renderBody({ entries, truncated: true });

    const button = await screen.findByRole('button', { name: /older|earlier|이전/i });
    expect(sendMock).toHaveBeenLastCalledWith(MessageType.GET_AGENT_TRANSCRIPT, expect.objectContaining({ pages: 1 }));
    fireEvent.click(button);

    await waitFor(() =>
      expect(sendMock).toHaveBeenLastCalledWith(MessageType.GET_AGENT_TRANSCRIPT, expect.objectContaining({ pages: 2 })),
    );
    // What was on screen stays while the larger window loads.
    expect(screen.getByText('There is one heading')).toBeInTheDocument();
  });
});
