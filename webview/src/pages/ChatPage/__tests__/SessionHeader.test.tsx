import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within, act } from '@testing-library/react';
import { OPEN_SESSION_DROPDOWN_EVENT } from '@/commandPalette/sections/context/items';
import userEvent from '@testing-library/user-event';
import { useState, type ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient } from '@/hooks/queries/__tests__/testQueryClient';
import { SessionHeader } from '../SessionHeader/index';
import { SessionMetaDto } from '../../../dto';
import type { SessionState } from '../../../types';

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

// Mock SettingsContext (SettingsButton reads openSettingsAs to pick overlay vs new tab)
vi.mock('../../../contexts/SettingsContext', () => ({
  useSettings: () => mockSettingsValue,
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

  it('새 탭 버튼 클릭 시 openNewTab 호출', async () => {
    const user = userEvent.setup();
    render(<SessionHeader />, { wrapper: queryWrapper });

    // 새 탭 버튼 클릭
    const newTabButton = screen.getByTitle('Open New Tab');
    await user.click(newTabButton);

    // openNewTab 호출 확인
    expect(mockSessionCtxValue.openNewTab).toHaveBeenCalled();
  });

  it('설정 버튼: openSettingsAs=overlay(기본)이면 새 탭(openSettings)을 열지 않음', async () => {
    const user = userEvent.setup();
    render(<SessionHeader />, { wrapper: queryWrapper });

    await user.click(screen.getByTitle('Settings'));

    // Overlay mode navigates in-tab; it must NOT open a dedicated tab.
    expect(mockSessionCtxValue.openSettings).not.toHaveBeenCalled();
  });

  it('설정 버튼: openSettingsAs=new-tab이면 openSettings 호출', async () => {
    const user = userEvent.setup();
    mockSettingsValue.settings.openSettingsAs = 'new-tab';
    render(<SessionHeader />, { wrapper: queryWrapper });

    await user.click(screen.getByTitle('Settings'));

    expect(mockSessionCtxValue.openSettings).toHaveBeenCalledTimes(1);
  });

  it('새 탭 버튼이 항상 활성화되어 있음', () => {
    mockSessionCtxValue.currentSessionId = null;
    mockSessionCtxValue.currentSession = null;
    render(<SessionHeader />, { wrapper: queryWrapper });

    // 버튼이 활성화되어 있음 확인
    const newTabButton = screen.getByTitle('Open New Tab');
    expect(newTabButton).not.toBeDisabled();
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
