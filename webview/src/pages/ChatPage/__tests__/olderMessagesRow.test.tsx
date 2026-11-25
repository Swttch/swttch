import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { LoadedMessageDto } from '../../../types';
import { ChatMessageArea } from '../ChatMessageArea';
import { TranscriptArea } from '../transcript/TranscriptArea';

/**
 * The row above the oldest message is a button while there is more to load and a spinner while it loads (#747).
 * A reader at the very top has nothing the browser can anchor on above them, so a row that changes height moves the
 * whole transcript under their eyes. jsdom lays nothing out, so what decides the height is compared instead.
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

const message = { uuid: 'a', type: 'assistant' } as LoadedMessageDto;

const props = {
  isStreaming: false,
  mergedMessages: [message],
  sections: [],
  carriedSend: null,
  hasMore: true,
  onLoadMore: vi.fn(),
};

/** The classes of an element that decide how tall it is. */
function heightClasses(element: Element): string[] {
  return Array.from(element.classList)
    .filter(name => /^(py-|leading-|h-|min-h-)/.test(name) || /^text-(xs|sm|base|\[[\d.]+rem\])$/.test(name) || name === 'border')
    .sort();
}

describe.each([
  ['the classic chat', ChatMessageArea],
  ['the transcript view modes', TranscriptArea],
] as const)('the older messages row of %s', (_name, Area) => {
  it('is as tall while a page loads as it was with the button', () => {
    const { container, rerender } = render(<Area {...props} isLoadingMore={false} />);
    const button = container.querySelector('button')!;
    const resting = heightClasses(button);

    rerender(<Area {...props} isLoadingMore />);
    const loading = container.querySelector('.animate-spin')!.parentElement!;

    expect(container.querySelector('button')).toBeNull();
    expect(resting).toContain('border');
    expect(heightClasses(loading)).toEqual(resting);
  });
});
