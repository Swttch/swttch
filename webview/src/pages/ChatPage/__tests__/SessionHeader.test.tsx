import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within, act, waitFor } from '@testing-library/react';
import { OPEN_SESSION_DROPDOWN_EVENT } from '@/commandPalette/sections/context/items';
import userEvent from '@testing-library/user-event';
import { useState, type ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient } from '@/hooks/queries/__tests__/testQueryClient';
import { SessionHeader } from '../SessionHeader/index';
import { SessionMetaDto } from '../../../dto';
import type { SessionState } from '../../../types';
import { Route } from '@/router';

// 테스트 시점 기준 상대 날짜 생성 헬퍼.
// 기준 시각을 "오늘 정오"로 고정한다. 자정 직후(예: 00:00~02:00)에 실행하면
// hoursAgo(2)가 어제로 넘어가 "Today" 그룹이 사라지는 시각 의존 flaky를 막는다.
const now = (() => {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  return d;
})();
const daysAgo = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 60 * 60 * 1000);

const mockSessions: SessionMetaDto[] = [
  { id: 'session-1', title: 'First Chat', updatedAt: hoursAgo(2), createdAt: hoursAgo(3), messageCount: 3, isSidechain: false },           // Today
  { id: 'session-2', title: 'Second Chat', updatedAt: daysAgo(1), createdAt: daysAgo(1), messageCount: 2, isSidechain: false },            // Yesterday
  { id: 'session-3', title: 'API Discussion', updatedAt: daysAgo(5), createdAt: daysAgo(5), messageCount: 5, isSidechain: false },         // Past week
];

// Mock context values
const mockSwitchSession = vi.fn();
const mockLoadSessions = vi.fn();
const mockSend = vi.fn();

let mockSessionCtxValue: any;
let mockSettingsValue: any;

// Mock SessionContext
vi.mock('../../../contexts/SessionContext', () => ({
  useSessionContext: () => mockSessionCtxValue,
}));

// Mock SettingsContext (other header widgets read it)
vi.mock('../../../contexts/SettingsContext', () => ({
  useSettings: () => mockSettingsValue,
}));

// SettingsButton goes through openSettingsAt(), which asks the adapter for a
// dedicated tab when the stored preference says new-tab.
const mockOpenSettingsAdapter = vi.fn();
vi.mock('@/adapters', () => ({
  getAdapter: () => ({ openSettings: mockOpenSettingsAdapter }),
}));

// Mock BridgeContext
vi.mock('../../../contexts/BridgeContext', () => ({
  useBridgeContext: () => ({
    send: mockSend,
    subscribe: vi.fn(() => vi.fn()),
    isConnected: true,
  }),
}));

// Mock react-router-dom (ProjectButton uses useNavigate, SettingsButton uses useRouter)
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: '/' }),
  useParams: () => ({}),
}));

// Mock WorkingDirContext (ProjectButton uses useWorkingDir)
vi.mock('../../../contexts/WorkingDirContext', () => ({
  useWorkingDir: () => ({
    workingDirectory: '/test',
    setWorkingDirectory: vi.fn(),
  }),
}));

// Mock AuthContext (AccountSwitcher uses useAuthContext). Logged-out → the
// account switcher renders nothing, leaving these header tests unaffected.
vi.mock('../../../contexts/AuthContext', () => ({
  useAuthContext: () => ({ loggedIn: false, refetch: vi.fn() }),
}));

// Mock WorkflowStateContext (BackgroundTasksButton uses useWorkflowState)
vi.mock('../../../contexts/WorkflowStateContext', () => ({
  useWorkflowState: () => ({
    tasks: [],
    getByToolUseId: () => undefined,
    runningTasks: [],
    finishedTasks: [],
    clearFinished: vi.fn(),
    panelOpen: false,
    openPanel: vi.fn(),
    closePanel: vi.fn(),
    focusedToolUseId: null,
  }),
}));

// Mock ScheduledMessagesContext (ScheduledMessagesButton uses useScheduledMessages)
vi.mock('../../../contexts/ScheduledMessagesContext', () => ({
  useScheduledMessages: () => ({
    reservations: [],
    cancel: vi.fn(),
    panelOpen: false,
    openPanel: vi.fn(),
    closePanel: vi.fn(),
    editing: null,
    startEdit: vi.fn(),
    stopEdit: vi.fn(),
  }),
}));

// Mock ChatStreamContext (TokenBatteryButton → useUsageData → useChatStreamContext)
vi.mock('../../../contexts/ChatStreamContext', () => ({
  useChatStreamContext: () => ({
    messages: [],
    isStreaming: false,
    error: null,
    streamingMessageId: null,
    input: '',
    setInput: vi.fn(),
    handleSubmit: vi.fn(),
    sendMessage: vi.fn(),
    stop: vi.fn(),
    continue: vi.fn(),
  }),
}));

// TokenBatteryButton → useUsageData → useUsageQuery needs a QueryClient.
function queryWrapper({ children }: { children: ReactNode }) {
  const [client] = useState(() => createTestQueryClient());
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  mockSwitchSession.mockReset();
  mockLoadSessions.mockReset();
  mockSend.mockReset();

  mockSessionCtxValue = {
    sessions: mockSessions,
    currentSessionId: 'session-1',
    currentSession: mockSessions[0],
    isLoading: false,
    sessionState: 'idle' as SessionState,
    workingDirectory: '/test',
    switchSession: mockSwitchSession,
    loadSessions: mockLoadSessions,
    resetToNewSession: vi.fn(),
    openNewTab: vi.fn(),
    openSettings: vi.fn(),
    deleteSession: vi.fn(),
    renameSession: vi.fn(),
    setSessionState: vi.fn(),
    setWorkingDirectory: vi.fn(),
  };

  mockSettingsValue = {
    settings: { openSettingsAs: 'overlay' },
    updateSettingWithScope: vi.fn(),
  };

  // openSettingsAt reads the open-mode preference from this cache; clear it so
  // one test's stored preference cannot leak into the next.
  mockOpenSettingsAdapter.mockReset();
  localStorage.clear();
});

describe('SessionHeader', () => {
  it('드롭다운 토글 버튼 클릭 시 드롭다운이 열림/닫힘', async () => {
    const user = userEvent.setup();
    render(<SessionHeader />, { wrapper: queryWrapper });

    // 초기 상태: 드롭다운 닫힘
    expect(screen.queryByPlaceholderText('Search sessions...')).not.toBeInTheDocument();

    // 토글 버튼 클릭 → 드롭다운 열림
    const toggleButton = screen.getByRole('button', { name: /First Chat/i });
    await user.click(toggleButton);
    expect(screen.getByPlaceholderText('Search sessions...')).toBeInTheDocument();

    // 다시 클릭 → 드롭다운 닫힘
    await user.click(toggleButton);
    expect(screen.queryByPlaceholderText('Search sessions...')).not.toBeInTheDocument();
  });

  it('/resume 이벤트(open-session-dropdown) 디스패치 시 드롭다운이 열리고 검색창에 포커스', async () => {
    render(<SessionHeader />, { wrapper: queryWrapper });

    // 초기 상태: 드롭다운 닫힘
    expect(screen.queryByPlaceholderText('Search sessions...')).not.toBeInTheDocument();

    // `/resume` 슬래시 커맨드가 디스패치하는 이벤트
    act(() => {
      window.dispatchEvent(new CustomEvent(OPEN_SESSION_DROPDOWN_EVENT));
    });

    const searchInput = screen.getByPlaceholderText('Search sessions...');
    expect(searchInput).toBeInTheDocument();
    expect(searchInput).toHaveFocus();
  });

  it('방향키(ArrowDown)로 세션을 이동하고 Enter로 진입', async () => {
    const user = userEvent.setup();
    render(<SessionHeader />, { wrapper: queryWrapper });
    await user.click(screen.getByRole('button', { name: /First Chat/i }));
    const searchInput = screen.getByPlaceholderText('Search sessions...');

    // -1 → 0(First Chat) → 1(Second Chat)
    fireEvent.keyDown(searchInput, { key: 'ArrowDown' });
    fireEvent.keyDown(searchInput, { key: 'ArrowDown' });
    fireEvent.keyDown(searchInput, { key: 'Enter' });

    expect(mockSwitchSession).toHaveBeenCalledWith('session-2');
  });

  it('하이라이트된 세션이 없을 때 Enter는 아무 세션도 진입하지 않음', async () => {
    const user = userEvent.setup();
    render(<SessionHeader />, { wrapper: queryWrapper });
    await user.click(screen.getByRole('button', { name: /First Chat/i }));
    const searchInput = screen.getByPlaceholderText('Search sessions...');

    // 방향키를 누르지 않은 상태(highlightedIndex = -1)
    fireEvent.keyDown(searchInput, { key: 'Enter' });

    expect(mockSwitchSession).not.toHaveBeenCalled();
  });

  it('Escape로 드롭다운이 닫힘', async () => {
    const user = userEvent.setup();
    render(<SessionHeader />, { wrapper: queryWrapper });
    await user.click(screen.getByRole('button', { name: /First Chat/i }));
    const searchInput = screen.getByPlaceholderText('Search sessions...');
    expect(searchInput).toBeInTheDocument();

    fireEvent.keyDown(searchInput, { key: 'Escape' });

    expect(screen.queryByPlaceholderText('Search sessions...')).not.toBeInTheDocument();
  });

  it('드롭다운이 열린 상태에서 Cmd/Ctrl+Shift+P로 세션 목록을 새로고침', async () => {
    const user = userEvent.setup();
    render(<SessionHeader />, { wrapper: queryWrapper });
    await user.click(screen.getByRole('button', { name: /First Chat/i }));

    mockLoadSessions.mockClear();
    fireEvent.keyDown(window, { key: 'P', ctrlKey: true, shiftKey: true });

    expect(mockLoadSessions).toHaveBeenCalledTimes(1);
  });

  it('세션 아이디(uuid)로 검색하면 해당 세션이 표시됨', async () => {
    const user = userEvent.setup();
    render(<SessionHeader />, { wrapper: queryWrapper });
    await user.click(screen.getByRole('button', { name: /First Chat/i }));

    const searchInput = screen.getByPlaceholderText('Search sessions...');
    await user.type(searchInput, 'session-3');

    const dropdown = document.querySelector('.max-h-80');
    expect(within(dropdown as HTMLElement).getByText('API Discussion')).toBeInTheDocument();
    expect(within(dropdown as HTMLElement).queryByText('First Chat')).not.toBeInTheDocument();
    expect(within(dropdown as HTMLElement).queryByText('Second Chat')).not.toBeInTheDocument();
  });

  it('드롭다운 외부 클릭 시 드롭다운이 닫힘', async () => {
    const user = userEvent.setup();
    const { container } = render(<SessionHeader />, { wrapper: queryWrapper });

    // 드롭다운 열기
    const toggleButton = screen.getByRole('button', { name: /First Chat/i });
    await user.click(toggleButton);
    expect(screen.getByPlaceholderText('Search sessions...')).toBeInTheDocument();

    // 외부 클릭
    fireEvent.mouseDown(container);
    expect(screen.queryByPlaceholderText('Search sessions...')).not.toBeInTheDocument();
  });

  it('세션 목록을 올바르게 렌더링', async () => {
    const user = userEvent.setup();
    render(<SessionHeader />, { wrapper: queryWrapper });

    // 드롭다운 열기
    await user.click(screen.getByRole('button', { name: /First Chat/i }));

    // 드롭다운 내부에서 모든 세션 목록 확인
    const dropdown = document.querySelector('.max-h-80');
    expect(within(dropdown as HTMLElement).getByText('First Chat')).toBeInTheDocument();
    expect(within(dropdown as HTMLElement).getByText('Second Chat')).toBeInTheDocument();
    expect(within(dropdown as HTMLElement).getByText('API Discussion')).toBeInTheDocument();
  });

  it('검색어 입력 시 필터링된 세션 목록 표시', async () => {
    const user = userEvent.setup();
    render(<SessionHeader />, { wrapper: queryWrapper });

    // 드롭다운 열기
    await user.click(screen.getByRole('button', { name: /First Chat/i }));

    // 검색어 입력
    const searchInput = screen.getByPlaceholderText('Search sessions...');
    await user.type(searchInput, 'API');

    // 드롭다운 내부에서 필터링 결과 확인
    const dropdown = document.querySelector('.max-h-80');
    expect(within(dropdown as HTMLElement).getByText('API Discussion')).toBeInTheDocument();
    expect(within(dropdown as HTMLElement).queryByText('First Chat')).not.toBeInTheDocument();
    expect(within(dropdown as HTMLElement).queryByText('Second Chat')).not.toBeInTheDocument();
  });

  it('검색어가 없을 때 "No matching sessions" 메시지 표시', async () => {
    const user = userEvent.setup();
    render(<SessionHeader />, { wrapper: queryWrapper });

    // 드롭다운 열기
    await user.click(screen.getByRole('button', { name: /First Chat/i }));

    // 매칭되지 않는 검색어 입력
    const searchInput = screen.getByPlaceholderText('Search sessions...');
    await user.type(searchInput, 'nonexistent');

    // 메시지 확인
    expect(screen.getByText('No matching sessions')).toBeInTheDocument();
  });

  it('세션 목록이 비어있을 때 "No sessions yet" 메시지 표시', async () => {
    const user = userEvent.setup();
    mockSessionCtxValue.sessions = [];
    mockSessionCtxValue.currentSession = null;
    render(<SessionHeader />, { wrapper: queryWrapper });

    // 드롭다운 열기 (세션 없으면 제목이 Past Conversations)
    await user.click(screen.getByRole('button', { name: /Past Conversations/i }));

    // 메시지 확인
    expect(screen.getByText('No sessions yet')).toBeInTheDocument();
  });

  it('세션 클릭 시 switchSession 호출 및 드롭다운 닫힘', async () => {
    const user = userEvent.setup();
    render(<SessionHeader />, { wrapper: queryWrapper });

    // 드롭다운 열기
    await user.click(screen.getByRole('button', { name: /First Chat/i }));

    // 드롭다운 메뉴 내부에서 세션 버튼 찾기
    const dropdown = document.querySelector('.max-h-80');
    const sessionButtons = within(dropdown as HTMLElement).getAllByRole('button');
    const secondChatButton = sessionButtons.find(
      button => button.textContent?.includes('Second Chat')
    );
    await user.click(secondChatButton!);

    // switchSession 호출 확인
    expect(mockSwitchSession).toHaveBeenCalledWith('session-2');

    // 드롭다운 닫힘 확인
    expect(screen.queryByPlaceholderText('Search sessions...')).not.toBeInTheDocument();
  });

  // The header's right side is now a user-arranged dock plus a ⋮ menu that holds
  // every feature. The dock starts empty, so these features are reached through
  // the menu — and reaching them there must do exactly what the old icons did.
  const openOverflowMenu = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByTitle('More'));
  };

  it('더보기 메뉴의 새 탭 항목 클릭 시 openNewTab 호출', async () => {
    const user = userEvent.setup();
    render(<SessionHeader />, { wrapper: queryWrapper });

    await openOverflowMenu(user);
    await user.click(screen.getByText('Open New Tab'));

    expect(mockSessionCtxValue.openNewTab).toHaveBeenCalled();
  });

  // The item delegates to openSettingsAt(), which reads the stored preference
  // and either requests an overlay or asks the adapter for a dedicated tab.
  it('설정 항목: openSettingsAs=overlay(기본)이면 새 탭을 열지 않음', async () => {
    const user = userEvent.setup();
    render(<SessionHeader />, { wrapper: queryWrapper });

    await openOverflowMenu(user);
    await user.click(screen.getByText('Settings'));

    // Overlay mode navigates in-tab; it must NOT open a dedicated tab.
    expect(mockOpenSettingsAdapter).not.toHaveBeenCalled();
  });

  it('설정 항목: openSettingsAs=new-tab이면 General 목적지로 새 탭을 연다', async () => {
    const user = userEvent.setup();
    localStorage.setItem(
      'claude-code-settings',
      JSON.stringify({ openSettingsAs: 'new-tab' }),
    );
    render(<SessionHeader />, { wrapper: queryWrapper });

    await openOverflowMenu(user);
    await user.click(screen.getByText('Settings'));

    expect(mockOpenSettingsAdapter).toHaveBeenCalledWith(Route.SETTINGS_GENERAL);
  });

  it('세션이 없어도 더보기 메뉴의 새 탭 항목은 활성화되어 있음', async () => {
    const user = userEvent.setup();
    mockSessionCtxValue.currentSessionId = null;
    mockSessionCtxValue.currentSession = null;
    render(<SessionHeader />, { wrapper: queryWrapper });

    await openOverflowMenu(user);
    expect(screen.getByText('Open New Tab').closest('button')).not.toBeDisabled();
  });

  // A fresh install must show ONLY ⋮ on the right — that is the whole point of
  // the change (the old header grew one icon per feature and squeezed the title).
  it('기본 상태에서 우측에는 더보기 버튼만 있고 도크는 비어 있다', () => {
    render(<SessionHeader />, { wrapper: queryWrapper });

    expect(screen.getByTitle('More')).toBeInTheDocument();
    // None of the dock icons are rendered until the user places them.
    expect(screen.queryByTitle('Remote Tunnel (Unofficial)')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Open New Tab')).not.toBeInTheDocument();
  });

  // There is no separate "edit mode" to switch into, and no two-section split:
  // the menu is always one ordered list, and clicking a row (not its drag handle
  // or its eye toggle) runs the feature directly — the same click that always ran it.
  it('더보기 메뉴는 항상 하나의 목록으로 표시된다', async () => {
    const user = userEvent.setup();
    render(<SessionHeader />, { wrapper: queryWrapper });

    await openOverflowMenu(user);

    // A fresh install has nothing docked, but every item is still listed.
    expect(screen.getByText('Open New Tab')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  // Clicking the eye toggle pulls an item into the dock — it must not run the
  // item (unlike clicking the row), and the icon must then appear in the dock.
  it('눈 아이콘을 누르면 실행되지 않고, 해당 항목이 도크에 나타난다', async () => {
    const user = userEvent.setup();
    render(<SessionHeader />, { wrapper: queryWrapper });

    await openOverflowMenu(user);
    const row = screen.getByText('Open New Tab').closest('button');
    const eyeToggle = row?.parentElement?.querySelector('button:last-of-type') as HTMLElement;
    expect(eyeToggle).toBeTruthy();

    await user.click(eyeToggle);
    expect(mockSessionCtxValue.openNewTab).not.toHaveBeenCalled();

    // The dock icon renders once the setting round-trips through updateSettingWithScope.
    expect(mockSettingsValue.updateSettingWithScope).toHaveBeenCalledWith(
      'dockLayout',
      expect.objectContaining({ visible: expect.arrayContaining(['newTab']) }),
      'global',
    );
  });

  // The row and its drag handle must never compete for the same gesture: a
  // press-and-move on the HANDLE must not run the item, and a plain click on the
  // ROW must still run it — exactly like every icon behaved before this menu.
  it('행의 드래그 핸들을 누르고 움직여도 항목이 실행되지 않는다', async () => {
    const user = userEvent.setup();
    render(<SessionHeader />, { wrapper: queryWrapper });

    await openOverflowMenu(user);
    const row = screen.getByText('Open New Tab').closest('button');
    const handle = row?.previousElementSibling as HTMLElement;
    expect(handle).toBeTruthy();

    // Real PointerEvents, not MouseEvent stand-ins: the drag layer narrows with
    // `instanceof PointerEvent`, so a MouseEvent would be ignored and this test
    // would pass without ever exercising the gesture it claims to.
    act(() => {
      handle.dispatchEvent(
        new PointerEvent('pointerdown', { bubbles: true, button: 0, buttons: 1, clientX: 0, clientY: 0 }),
      );
    });
    act(() => {
      window.dispatchEvent(
        new PointerEvent('pointermove', { bubbles: true, button: 0, buttons: 1, clientX: 0, clientY: 90 }),
      );
    });
    expect(mockSessionCtxValue.openNewTab).not.toHaveBeenCalled();

    act(() => {
      window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0, clientX: 0, clientY: 90 }));
    });

    // A plain click on the row itself still runs it, same as before this menu existed.
    await user.click(screen.getByText('Open New Tab'));
    expect(mockSessionCtxValue.openNewTab).toHaveBeenCalled();
  });

  // Reordering must not require a mouse, and the keyboard path rests on two
  // things that are easy to undo by accident: the handle has to be focusable (a
  // <button>, not a <span>), and the drag layer keys off `event.code` ("Space"),
  // not `event.key` (" "). Both are asserted here.
  //
  // Where the row LANDS is not: the drag layer measures rows through its own
  // cache, and jsdom reports a zero rect for everything, so no amount of stubbing
  // makes an arrow key resolve to a real position. That half is covered by
  // driving a real browser instead.
  it('드래그 핸들은 키보드로 집을 수 있다', async () => {
    const user = userEvent.setup();
    render(<SessionHeader />, { wrapper: queryWrapper });

    await openOverflowMenu(user);
    const rowCount = screen.getAllByTitle('Drag to rearrange').length;
    const first = screen.getAllByTitle('Drag to rearrange')[0] as HTMLButtonElement;

    first.focus();
    expect(document.activeElement).toBe(first);

    act(() => {
      first.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true, cancelable: true }));
    });

    // Picking a row up lifts it out of the flow and leaves a placeholder behind,
    // so the list renders exactly one row more than it has items.
    await waitFor(() => {
      expect(screen.getAllByTitle('Drag to rearrange')).toHaveLength(rowCount + 1);
    });
    // Space picked the row up rather than activating the row's own button.
    expect(mockSessionCtxValue.openNewTab).not.toHaveBeenCalled();
  });

  // A drag the user backs out of must leave nothing behind. This regressed once:
  // previewing the reorder by writing each intermediate order straight to
  // settings meant a cancel had nothing left to restore, and the abandoned order
  // stuck permanently.
  it('드래그를 Esc로 취소하면 순서가 저장되지 않는다', async () => {
    const user = userEvent.setup();
    render(<SessionHeader />, { wrapper: queryWrapper });

    await openOverflowMenu(user);
    mockSettingsValue.updateSettingWithScope.mockClear();

    const handles = screen.getAllByTitle('Drag to rearrange');
    const first = handles[0] as HTMLButtonElement;
    first.focus();

    const press = (code: string, key: string) =>
      act(() => {
        first.dispatchEvent(new KeyboardEvent('keydown', { code, key, bubbles: true, cancelable: true }));
      });

    press('Space', ' ');
    press('ArrowDown', 'ArrowDown');
    press('Escape', 'Escape');

    expect(mockSettingsValue.updateSettingWithScope).not.toHaveBeenCalled();
  });

  it('현재 세션이 하이라이트 스타일로 표시', async () => {
    const user = userEvent.setup();
    render(<SessionHeader />, { wrapper: queryWrapper });

    // 드롭다운 열기
    await user.click(screen.getByRole('button', { name: /First Chat/i }));

    // 현재 세션 확인
    const sessionButtons = screen.getAllByRole('button');
    const currentSessionButton = sessionButtons.find(
      button => button.textContent?.includes('First Chat') && button.classList.contains('bg-[var(--surface-selected)]')
    );

    expect(currentSessionButton).toBeInTheDocument();
    expect(currentSessionButton).toHaveClass('text-text-primary', 'bg-[var(--surface-selected)]');
  });

  it('비활성 세션은 다른 스타일로 표시', async () => {
    const user = userEvent.setup();
    render(<SessionHeader />, { wrapper: queryWrapper });

    // 드롭다운 열기
    await user.click(screen.getByRole('button', { name: /First Chat/i }));

    // 비활성 세션 확인
    const sessionButtons = screen.getAllByRole('button');
    const inactiveSessionButton = sessionButtons.find(
      button => button.textContent?.includes('Second Chat')
    );

    expect(inactiveSessionButton).toHaveClass('text-text-secondary');
    expect(inactiveSessionButton).not.toHaveClass('bg-[var(--surface-selected)]');
  });

  it('세션 제목이 없을 때 "Past Conversations" 표시', () => {
    mockSessionCtxValue.currentSession = null;
    render(<SessionHeader />, { wrapper: queryWrapper });

    // "Past Conversations" 표시 확인
    expect(screen.getByText('Past Conversations')).toBeInTheDocument();
  });

  it('세션에 updatedAt이 있을 때 상대 시간 표시', async () => {
    const user = userEvent.setup();
    render(<SessionHeader />, { wrapper: queryWrapper });

    // 드롭다운 열기
    await user.click(screen.getByRole('button', { name: /First Chat/i }));

    // 드롭다운 내부에서 세션 버튼 찾기
    const dropdown = document.querySelector('.max-h-80');
    const sessionButtons = within(dropdown as HTMLElement).getAllByRole('button');
    const firstChatButton = sessionButtons.find(
      button => button.textContent?.includes('First Chat')
    );

    // 상대 시간이 표시되는지 확인 (정확한 값은 getRelativeTime 로직에 따라 다름)
    expect(firstChatButton?.textContent).toMatch(/\d+[mhd]|now/);
  });

  it('regex 검색이 올바르게 작동', async () => {
    const user = userEvent.setup();
    render(<SessionHeader />, { wrapper: queryWrapper });

    // 드롭다운 열기
    await user.click(screen.getByRole('button', { name: /First Chat/i }));

    // regex 검색어 입력
    const searchInput = screen.getByPlaceholderText('Search sessions...');
    await user.type(searchInput, '^API');

    // 드롭다운 내부에서 필터링 결과 확인
    const dropdown = document.querySelector('.max-h-80');
    expect(within(dropdown as HTMLElement).getByText('API Discussion')).toBeInTheDocument();
    expect(within(dropdown as HTMLElement).queryByText('First Chat')).not.toBeInTheDocument();
  });

  it('잘못된 regex 검색어일 때 fallback으로 includes 검색', async () => {
    const user = userEvent.setup();
    render(<SessionHeader />, { wrapper: queryWrapper });

    // 드롭다운 열기
    await user.click(screen.getByRole('button', { name: /First Chat/i }));

    // 잘못된 regex 검색어 입력 (fireEvent 사용으로 특수문자 문제 해결)
    const searchInput = screen.getByPlaceholderText('Search sessions...');
    fireEvent.change(searchInput, { target: { value: '[invalid' } });

    // includes 검색으로 fallback 확인 (아무것도 매칭되지 않음)
    expect(screen.getByText('No matching sessions')).toBeInTheDocument();
  });

  it('검색어 초기화 시 모든 세션이 다시 표시', async () => {
    const user = userEvent.setup();
    render(<SessionHeader />, { wrapper: queryWrapper });

    // 드롭다운 열기
    await user.click(screen.getByRole('button', { name: /First Chat/i }));

    // 검색어 입력
    const searchInput = screen.getByPlaceholderText('Search sessions...');
    await user.type(searchInput, 'API');

    // 드롭다운 내부에서 필터링 확인
    const dropdown = document.querySelector('.max-h-80');
    expect(within(dropdown as HTMLElement).queryByText('First Chat')).not.toBeInTheDocument();

    // 검색어 초기화
    await user.clear(searchInput);

    // 드롭다운 내부에서 모든 세션 다시 표시 확인
    expect(within(dropdown as HTMLElement).getByText('First Chat')).toBeInTheDocument();
    expect(within(dropdown as HTMLElement).getByText('Second Chat')).toBeInTheDocument();
    expect(within(dropdown as HTMLElement).getByText('API Discussion')).toBeInTheDocument();
  });

  it('세션 선택 시 검색어 초기화', async () => {
    const user = userEvent.setup();
    render(<SessionHeader />, { wrapper: queryWrapper });

    // 드롭다운 열기
    await user.click(screen.getByRole('button', { name: /First Chat/i }));

    // 검색어 입력
    const searchInput = screen.getByPlaceholderText('Search sessions...');
    await user.type(searchInput, 'Second');

    // 드롭다운 내부에서 세션 선택
    const dropdown = document.querySelector('.max-h-80');
    const sessionButtons = within(dropdown as HTMLElement).getAllByRole('button');
    const secondChatButton = sessionButtons.find(
      button => button.textContent?.includes('Second Chat')
    );
    await user.click(secondChatButton!);

    // 드롭다운 다시 열기
    await user.click(screen.getByRole('button', { name: /First Chat/i }));

    // 검색어 초기화 확인
    expect(screen.getByPlaceholderText('Search sessions...')).toHaveValue('');
  });
});

describe('SessionHeader - 날짜별 그룹화', () => {
  it('세션이 올바른 그룹 라벨 아래에 표시됨', async () => {
    const user = userEvent.setup();
    render(<SessionHeader />, { wrapper: queryWrapper });

    await user.click(screen.getByRole('button', { name: /First Chat/i }));

    // 그룹 라벨 확인
    expect(screen.getByText('Today')).toBeInTheDocument();
    expect(screen.getByText('Yesterday')).toBeInTheDocument();
    expect(screen.getByText('Past week')).toBeInTheDocument();

    // 비어있는 그룹은 표시되지 않음
    expect(screen.queryByText('Past month')).not.toBeInTheDocument();
    expect(screen.queryByText('Past year')).not.toBeInTheDocument();
  });

  it('검색 필터링 후에도 그룹화가 적용됨', async () => {
    const user = userEvent.setup();
    render(<SessionHeader />, { wrapper: queryWrapper });

    await user.click(screen.getByRole('button', { name: /First Chat/i }));
    await user.type(screen.getByPlaceholderText('Search sessions...'), 'API');

    // 필터링된 세션의 그룹만 표시
    expect(screen.getByText('Past week')).toBeInTheDocument();
    expect(screen.queryByText('Today')).not.toBeInTheDocument();
  });

  it('updatedAt이 없는 세션은 Past year 그룹에 배치', async () => {
    const user = userEvent.setup();
    mockSessionCtxValue.sessions = [
      ...mockSessions,
      { id: 'session-4', title: 'Old Session', updatedAt: undefined as unknown as Date, createdAt: daysAgo(400), messageCount: 1 },
    ];
    render(<SessionHeader />, { wrapper: queryWrapper });

    await user.click(screen.getByRole('button', { name: /First Chat/i }));

    expect(screen.getByText('Past year')).toBeInTheDocument();
    expect(screen.getByText('Old Session')).toBeInTheDocument();
  });
});
