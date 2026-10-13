import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { ChatMessageArea } from '../ChatMessageArea';
import type { LoadedMessageDto } from '../../../types';
import { LoadedMessageType, MessageRole } from '../../../dto/common';
import { mergeToolResults } from '../mergeToolResults';
import { groupIntoSendSections } from '../groupIntoSendSections';

vi.mock('../../../contexts/SessionContext', () => ({
  useSessionContext: () => ({
    workingDirectory: '/test/path',
    setWorkingDirectory: vi.fn(),
    sessions: [],
    currentSessionId: null,
    addNewSession: vi.fn(),
  }),
}));

vi.mock('../../../contexts/ChatStreamContext', () => ({
  useChatStreamContext: () => ({ messages: [], retry: vi.fn() }),
}));

vi.mock('@/contexts/BridgeContext', () => ({
  useBridgeContext: () => ({ send: vi.fn().mockResolvedValue({ status: 'ok' }) }),
}));

vi.mock('@/contexts/ApiContext', () => ({
  useApi: () => ({ sessions: { load: vi.fn() } }),
}));

vi.mock('../MessageBubble', () => ({
  MessageBubble: ({ message }: { message: LoadedMessageDto }) => (
    <div data-testid="bubble">{message.type}</div>
  ),
}));

vi.mock('@/pages/ProjectSelectorPage', () => ({
  ProjectSelectorPage: () => null,
}));

vi.mock('../EmptyState', () => ({
  EmptyState: () => null,
}));

/**
 * An entry in the session file does not always carry a `uuid`: the field is
 * optional on `LoadedMessageDto`, and nothing upstream fills it in. The list
 * that draws a send's reply keyed each row by that field, so a row without one
 * had no key at all and React warned on every render of the chat.
 */
describe('ChatMessageArea row keys', () => {
  let errors: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
    errors = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    errors.mockRestore();
  });

  const keyWarnings = () =>
    errors.mock.calls.filter((call: unknown[]) => String(call[0]).includes('unique "key"'));

  const renderReplyWithRowsLackingUuid = () => {
    const messages: LoadedMessageDto[] = [
      { uuid: 'u1', type: LoadedMessageType.User, message: { role: MessageRole.User, content: 'Hello' } },
      { type: LoadedMessageType.Assistant, message: { role: MessageRole.Assistant, content: [{ type: 'text', text: 'one' }] } },
      { type: LoadedMessageType.Assistant, message: { role: MessageRole.Assistant, content: [{ type: 'text', text: 'two' }] } },
    ] as LoadedMessageDto[];
    const merged = mergeToolResults(messages);

    return render(
      <MemoryRouter>
        <ChatMessageArea
          isStreaming={false}
          mergedMessages={merged}
          sections={groupIntoSendSections(merged)}
          carriedSend={null}
          hasMore={false}
          isLoadingMore={false}
          onLoadMore={vi.fn()}
        />
      </MemoryRouter>,
    );
  };

  // One test on purpose: React warns about a missing key once per component, so
  // a second test in this file would find the warning already spent.
  it('draws every row of a reply, the ones with no uuid included, without asking React for a key it was never given', () => {
    renderReplyWithRowsLackingUuid();

    expect(screen.getAllByTestId('bubble')).toHaveLength(3);
    expect(keyWarnings()).toHaveLength(0);
  });
});
