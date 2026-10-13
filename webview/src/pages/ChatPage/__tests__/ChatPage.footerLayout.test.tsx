import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChatInputFocusProvider, useChatInputFocus } from '@/contexts/ChatInputFocusContext';
import { TopBarProvider } from '@/contexts/TopBarContext';

/*
 * How the strip at the bottom of the chat (the composer, or the panel that
 * stands in for it) sits against the send index. The scroll container keeps the
 * end edge of the transcript clear for the rail by padding it, and the strip
 * lives inside that container, so it gave up the same room: the composer sat
 * 24px off-centre, with more space on its end side than its start side.
 *
 * The strip stays inside the container, because that is what lets the
 * transcript run on behind it and show around it; it takes the room back by
 * reaching over the padding. ChatPage is rendered with everything around its
 * root stubbed out, since only the arrangement of the container, the rail and
 * the strip is under test.
 */

const { stub, spies } = vi.hoisted(() => ({
  stub: (name: string) => () => <div data-testid={name} />,
  spies: {
    useDocumentTitle: vi.fn(),
    useReportSessionActivity: vi.fn(),
    useMarkSessionRead: vi.fn(),
  },
}));

vi.mock('../ChatInput/DictationProvider', () => ({ DictationProvider: ({ children }: any) => <>{children}</> }));
vi.mock('../ListeningNotice', () => ({ ListeningNotice: stub('listening') }));
vi.mock('../SessionHeader', () => ({ SessionHeader: stub('header') }));
vi.mock('../useDesktopTabActions', () => ({ useDesktopTabActions: () => {} }));
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
vi.mock('@/components/SideQuestionModal', () => ({ SideQuestionModal: stub('sideQuestion') }));
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
    error: null,
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
vi.mock('../../../hooks', () => ({ useAwaitingNotifications: () => {}, useDocumentTitle: spies.useDocumentTitle }));
vi.mock('../../../hooks/useReportSessionActivity', () => ({ useReportSessionActivity: spies.useReportSessionActivity }));
vi.mock('../../../hooks/useMarkSessionRead', () => ({ useMarkSessionRead: spies.useMarkSessionRead }));
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

function renderPage(displayed = true) {
  return render(
    <TopBarProvider displayed={displayed}>
      <ChatInputFocusProvider>
        <ChatPage />
      </ChatInputFocusProvider>
    </TopBarProvider>,
  );
}

const footerOf = (container: HTMLElement) => container.querySelector<HTMLElement>('#chat-footer')!;
const scrollerOf = (container: HTMLElement) => container.querySelector<HTMLElement>('[data-chat-scroll]')!;

describe('ChatPage bottom strip layout', () => {
  it('keeps the strip inside the scroll container, so the transcript runs on behind it', () => {
    const { container } = renderPage();

    expect(scrollerOf(container).contains(footerOf(container))).toBe(true);
  });

  it('reaches the strip over the room the rail reserves, so its two sides have the same space', () => {
    const { container } = renderPage();

    // The mocked rail is 16px wide: the strip takes exactly that much back.
    expect(footerOf(container).style.marginInlineEnd).toBe('-16px');
  });

  it('still reserves the rail width beside the transcript itself', () => {
    const { container } = renderPage();

    expect(scrollerOf(container).style.paddingInlineEnd).toBe('16px');
  });

  it('keeps the rail a sibling of the scroll container, not a child of it', () => {
    const { container } = renderPage();

    expect(screen.getByTestId('sendIndex').parentElement).toBe(scrollerOf(container).parentElement);
    expect(scrollerOf(container).contains(screen.getByTestId('sendIndex'))).toBe(false);
  });
});
