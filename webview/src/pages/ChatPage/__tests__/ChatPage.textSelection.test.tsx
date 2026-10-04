import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChatInputFocusProvider, useChatInputFocus } from '@/contexts/ChatInputFocusContext';

/*
 * #513: a mousedown on empty chat space must keep its default action, because
 * the browser starts word and drag selection from it. ChatPage is rendered with
 * everything around the root element stubbed out, since only the root's own
 * event handling is under test.
 */

const { stub } = vi.hoisted(() => ({
  stub: (name: string) => () => <div data-testid={name} />,
}));

vi.mock('../ChatInput/DictationProvider', () => ({ DictationProvider: ({ children }: any) => <>{children}</> }));
vi.mock('../ListeningNotice', () => ({ ListeningNotice: stub('listening') }));
vi.mock('../SessionHeader', () => ({ SessionHeader: stub('header') }));
vi.mock('../ChatMessageArea', () => ({
  ChatMessageArea: () => <p data-testid="message-text">some chat text</p>,
}));
vi.mock('../PermissionBanner', () => ({ PermissionBanner: stub('perm') }));
vi.mock('../AskUserQuestionInputPanel', () => ({ AskUserQuestionInputPanel: stub('ask') }));
vi.mock('../AcceptPlanPanel', () => ({ AcceptPlanPanel: stub('plan') }));
vi.mock('../BannerArea', () => ({ BannerArea: ({ children }: any) => <>{children}</> }));
vi.mock('../UpdateBanner', () => ({ UpdateBanner: stub('update') }));
vi.mock('../ConnectionLostBanner', () => ({ ConnectionLostBanner: stub('conn') }));
vi.mock('../AuthErrorBanner', () => ({ AuthErrorBanner: stub('auth') }));
vi.mock('../BrowserPermissionBanner', () => ({ BrowserPermissionBanner: stub('browser') }));
vi.mock('../MigrationBanner', () => ({ MigrationBanner: stub('migration') }));
vi.mock('../BackgroundTasksPanel', () => ({ BackgroundTasksPanel: stub('bg') }));
vi.mock('../ScheduledMessagesPanel', () => ({
  ScheduledMessagesPanel: stub('sched'),
  ScheduledMessageEditOverlay: stub('schedEdit'),
}));
vi.mock('@/components/McpModal', () => ({ McpModal: stub('mcp') }));
vi.mock('../../DiffPage/DiffOverlay', () => ({ DiffOverlay: stub('diff') }));
vi.mock('@/components/Announcements/placements', () => ({
  AnnouncementTopBannerSlot: stub('annTop'),
  AnnouncementModalSlot: stub('annModal'),
}));
vi.mock('@/components/WhatsNewModal/WhatsNewSlot', () => ({ WhatsNewSlot: stub('whatsNew') }));
vi.mock('@/commandPalette/sections/customize/items', () => ({ OPEN_MCP_MODAL_EVENT: 'open-mcp' }));
vi.mock('@/commandPalette/sections/context/items', () => ({ OPEN_PROMPT_LIBRARY_EVENT: 'open-prompt-library' }));
vi.mock('@/components/PromptLibraryModal', () => ({ PromptLibraryModal: stub('promptLib') }));
vi.mock('@/hooks/useMcpServers', () => ({ useMcpServers: () => ({}), MCP_SERVERS_QUERY_KEY: ['mcp'] }));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock('../../../contexts/ChatStreamContext', () => ({
  useChatStreamContext: () => ({
    messages: [],
    isStreaming: false,
    disconnectCountdown: null,
    apiRetry: null,
    hasMoreOlder: false,
    oldestLoadedUuid: null,
  }),
}));
vi.mock('../../../hooks/useScheduledDelivery/useScheduledDelivery', () => ({ useScheduledDelivery: () => {} }));
vi.mock('../../../contexts/SessionContext', () => ({
  useSessionContext: () => ({ currentSessionId: 's1', currentSession: { title: 't' } }),
}));
vi.mock('../../../hooks', () => ({ useAwaitingNotifications: () => {} }));
vi.mock('../../../hooks/usePendingAskUserQuestion', () => ({
  usePendingAskUserQuestion: () => ({ pending: null, dismiss: () => {} }),
}));
vi.mock('../../../hooks/usePendingPermissions', () => ({
  usePendingPermissions: () => ({ pending: null, approve: () => {}, approveForSession: () => {}, deny: () => {} }),
}));
vi.mock('../../../hooks/usePendingPlanApproval', () => ({
  usePendingPlanApproval: () => ({ pending: null, approve: () => {}, deny: () => {} }),
}));
vi.mock('../useChatAutoScroll', () => ({
  useChatAutoScroll: () => ({
    scrollRef: { current: null },
    showScrollButton: false,
    rememberScrollPosition: () => {},
    prevScrollTopRef: { current: 0 },
    lastScrollHeightRef: { current: 0 },
  }),
}));
vi.mock('../../../contexts/ApiContext', () => ({ useApi: () => ({ sessions: { loadOlder: vi.fn() } }) }));
vi.mock('@/i18n', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
vi.mock('@/contexts/AutoResumeContext', () => ({ AutoResumeProvider: ({ children }: any) => <>{children}</> }));
vi.mock('@/contexts/OnboardingContext', () => ({ useOnboarding: () => ({ visible: false }) }));
vi.mock('../ChatInput', () => ({
  ChatInput: () => {
    const { textareaRef } = useChatInputFocus();
    return <div data-testid="composer" ref={textareaRef} contentEditable suppressContentEditableWarning tabIndex={0} />;
  },
}));
vi.mock('../AccountSwitchErrorBanner', () => ({ AccountSwitchErrorBanner: stub('acct') }));
vi.mock('../SendIndex', () => ({ SendIndex: stub('sendIndex'), SEND_INDEX_RAIL_WIDTH: 16 }));
vi.mock('@/hooks/useSessionSends', () => ({ useSessionSends: () => [] }));

import { ChatPage } from '../index';

describe('ChatPage text selection (#513)', () => {
  it('leaves mousedown on non-control chat content uncancelled and does not move focus to the composer', () => {
    render(
      <ChatInputFocusProvider>
        <ChatPage />
      </ChatInputFocusProvider>,
    );
    const text = screen.getByTestId('message-text');
    const composer = screen.getByTestId('composer');
    expect(document.activeElement).not.toBe(composer);

    // fireEvent returns false when the event's default was prevented.
    const notPrevented = fireEvent.mouseDown(text);

    expect(notPrevented).toBe(true);
    expect(document.activeElement).not.toBe(composer);
  });
});
