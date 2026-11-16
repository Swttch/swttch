import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { act, render, screen } from '@testing-library/react';
import { ChatMessageArea } from '../ChatMessageArea';
import { useChatStream } from '../../../hooks/useChatStream';
import type { LoadedMessageDto } from '../../../types';
import { MessageType } from '@/shared';
import { mergeToolResults } from '../mergeToolResults';
import { groupIntoSendSections } from '../groupIntoSendSections';

vi.mock('../../../contexts/SessionContext', () => ({
  useSessionContextOrNull: () => null,
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

type Handler = (msg: { type: string; payload: Record<string, unknown>; timestamp: number }) => void;

function createMockBridge() {
  const handlers = new Map<string, Set<Handler>>();
  return {
    bridge: {
      isConnected: true,
      send: vi.fn().mockResolvedValue(undefined),
      subscribe: vi.fn((type: string, handler: Handler) => {
        if (!handlers.has(type)) handlers.set(type, new Set());
        handlers.get(type)!.add(handler);
        return () => { handlers.get(type)?.delete(handler); };
      }),
    },
    emit: (type: string, payload: Record<string, unknown>) => {
      handlers.get(type)?.forEach(h => h({ type, payload, timestamp: Date.now() }));
    },
  };
}

/** The live chat as the page wires it: the stream's messages, merged and split into sends, drawn by the list. */
function LiveChat({ bridge, onStream }: { bridge: ReturnType<typeof createMockBridge>['bridge']; onStream: (s: ReturnType<typeof useChatStream>) => void }) {
  const stream = useChatStream({ bridge: bridge as never });
  onStream(stream);
  const merged = mergeToolResults(stream.messages);
  return (
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
    </MemoryRouter>
  );
}

/**
 * The CLI writes each finished content block of a response as its own session entry, with its own uuid, and the
 * reply being streamed takes over each one's uuid as it arrives. The reply's row in the list has to stay the same
 * element through that. When its key followed the uuid, every finished block remounted the whole reply, and each
 * Edit card in it was drawn for a frame without its diff: the view, held at the bottom, was pulled up by the
 * missing height and slid back once the diffs returned — once per block, for as long as the reply ran.
 */
describe('ChatMessageArea streaming reply row', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('stays the same element while the CLI gives the reply the uuid of each finished block', () => {
    const { bridge, emit } = createMockBridge();
    let stream!: ReturnType<typeof useChatStream>;
    render(<LiveChat bridge={bridge} onStream={(s) => { stream = s; }} />);

    act(() => {
      stream.addUserMessage('Edit the file');
    });
    const replyRow = () => {
      const bubbles = screen.getAllByTestId('bubble');
      return bubbles[bubbles.length - 1].parentElement;
    };
    const rowWhileStreaming = replyRow();

    act(() => {
      emit(MessageType.CLI_EVENT, {
        type: 'assistant',
        uuid: 'entry-text',
        message: { id: 'msg_1', content: [{ type: 'text', text: 'Editing it now.' }] },
      });
    });
    act(() => {
      emit(MessageType.CLI_EVENT, {
        type: 'assistant',
        uuid: 'entry-edit',
        message: {
          id: 'msg_1',
          content: [{ type: 'tool_use', id: 'tool_1', name: 'Edit', input: { file_path: '/a.ts', old_string: 'a', new_string: 'b' } }],
        },
      });
    });

    // The reply did take the last entry's uuid: that is what rewind, fork and the rest address it by.
    expect(stream.messages[stream.messages.length - 1].uuid).toBe('entry-edit');
    expect(screen.getAllByTestId('bubble')).toHaveLength(2);
    expect(replyRow()).toBe(rowWhileStreaming);
  });
});
