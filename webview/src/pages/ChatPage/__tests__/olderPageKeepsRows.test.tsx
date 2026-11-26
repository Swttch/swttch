import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { LoadedMessageDto } from '../../../types';
import { ChatMessageArea } from '../ChatMessageArea';
import { TranscriptArea } from '../transcript/TranscriptArea';
import { groupIntoSendSections, type SendSection } from '../groupIntoSendSections';
import { reuseSections } from '../reuseSections';

/**
 * #747. A long reply is held from its middle, and an older page is put in front of it. What was on screen has to stay
 * the very elements it was: drawn again, every message of it is parsed again, which is a pause at each page, and the
 * browser loses what it was holding the reader's place on.
 */
vi.mock('../../../contexts/SessionContext', () => ({
  useSessionContext: () => ({ workingDirectory: '/work', currentSessionId: 's' }),
  useSessionContextOrNull: () => null,
}));
vi.mock('../../../contexts/ChatStreamContext', () => ({
  useChatStreamContext: () => ({
    retry: vi.fn(),
    messages: [],
    isStreaming: false,
    heldMessages: [],
    releaseHeldMessages: vi.fn(),
    dropReleasedHeldMessages: vi.fn(),
    questionRepliedTurn: false,
  }),
}));
vi.mock('../useSendActions', () => ({ useSendActions: () => ({}) }));
vi.mock('../useSectionFold', () => ({ useSectionFold: () => ({ isCollapsed: () => false, toggle: vi.fn() }) }));
vi.mock('../chatSearch/useChatSearch', () => ({ useChatSearch: () => ({}) }));
vi.mock('../chatSearch/ChatSearchBar', () => ({ ChatSearchBar: () => null }));
vi.mock('../SelectionReply/SelectionReplyLayer', () => ({ SelectionReplyLayer: () => null }));
vi.mock('../StreamErrorBanner', () => ({ StreamErrorBanner: () => null }));
vi.mock('../PendingSentMessages', () => ({ PendingSentMessages: () => null }));
vi.mock('../transcript/TranscriptHeldMessages', () => ({ TranscriptHeldMessages: () => null }));
vi.mock('../transcript/TranscriptExternalWorking', () => ({ TranscriptExternalWorking: () => null }));
vi.mock('../../../hooks/useReleaseHeldMessages', () => ({ useReleaseHeldMessages: () => {} }));
// What a message is drawn with is not what is asked about here: only whether its element stays.
vi.mock('../MessageBubble', () => ({ MessageBubble: ({ message }: { message: LoadedMessageDto }) => <p>{message.uuid}</p> }));
vi.mock('../StreamingMessage', () => ({ StreamingMessage: ({ content }: { content: string }) => <p>{content}</p> }));
vi.mock('../transcript/TranscriptTurnFooter', () => ({ TranscriptTurnFooter: () => null }));
vi.mock('../transcript/TranscriptWrapUp', () => ({ TranscriptWrapUp: () => null }));
vi.mock('../TurnWrapUp', () => ({ TurnWrapUp: () => null }));

const reply = (uuid: string) =>
  ({ uuid, type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: uuid }] } }) as unknown as LoadedMessageDto;

describe.each([
  ['the classic chat', ChatMessageArea],
  ['the transcript view modes', TranscriptArea],
] as const)('an older page in %s', (_name, Area) => {
  it('leaves the rows already drawn as the elements they were', () => {
    const newest = [reply('step-3'), reply('step-4')];
    const first = reuseSections([], groupIntoSendSections(newest));
    const draw = (messages: LoadedMessageDto[], sections: SendSection[]) => (
      <Area
        isStreaming={false}
        mergedMessages={messages}
        sections={sections}
        carriedSend={null}
        hasMore
        isLoadingMore={false}
        onLoadMore={vi.fn()}
      />
    );
    const { rerender } = render(draw(newest, first));
    const held = [screen.getByText('step-3'), screen.getByText('step-4')];

    const all = [reply('step-1'), reply('step-2'), ...newest];
    rerender(draw(all, reuseSections(first, groupIntoSendSections(all))));

    expect(screen.getByText('step-1')).toBeInTheDocument();
    expect(screen.getByText('step-3')).toBe(held[0]);
    expect(screen.getByText('step-4')).toBe(held[1]);
  });
});
