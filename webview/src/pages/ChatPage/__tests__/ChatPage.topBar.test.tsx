import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChatInputFocusProvider, useChatInputFocus } from '@/contexts/ChatInputFocusContext';
import { TopBarProvider, TOP_BAR_HEIGHT } from '@/contexts/TopBarContext';

/*
 * `top_bar_display=F`: the bar is left out of the page, and the page goes on
 * doing what the bar used to do for it. ChatPage is rendered with everything
 * around its root stubbed out, since only what it hands the bar and its three
 * outward-facing hooks are under test.
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

function renderPage(displayed?: boolean) {
  return render(
    <TopBarProvider displayed={displayed}>
      <ChatInputFocusProvider>
        <ChatPage />
      </ChatInputFocusProvider>
    </TopBarProvider>,
  );
}

describe('ChatPage top bar display', () => {
  beforeEach(() => {
    Object.values(spies).forEach((spy) => spy.mockClear());
  });

  it('draws the top bar and reserves its height above the transcript by default', () => {
    const { container } = renderPage();

    expect(screen.queryByTestId('header')).not.toBeNull();
    const scroller = container.querySelector<HTMLElement>('[data-chat-scroll]')!;
    expect(scroller.style.paddingTop).toBe(`${TOP_BAR_HEIGHT}px`);
  });

  it('leaves the top bar out and reserves no space for it when hidden', () => {
    const { container } = renderPage(false);

    expect(screen.queryByTestId('header')).toBeNull();
    const scroller = container.querySelector<HTMLElement>('[data-chat-scroll]')!;
    expect(scroller.style.paddingTop).toBe('0px');
  });

  it.each([
    ['drawn', true],
    ['hidden', false],
  ])('tells the tab, the backend and the session list what this page is doing while the bar is %s', (_label, displayed) => {
    renderPage(displayed);

    expect(spies.useDocumentTitle).toHaveBeenCalledWith('t', false, false, null, false);
    expect(spies.useReportSessionActivity).toHaveBeenCalledWith('s1', false, false);
    expect(spies.useMarkSessionRead).toHaveBeenCalledWith('s1', false);
  });
});
