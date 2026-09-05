import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SessionPanelPage } from '../index';
import { MessageType } from '@/shared';

const { session, groupedOne, emptyGroups, mockOpenNewTab, mockOpenSession, mockLoadSessions, mockUseSessionList, mockUseSessionContext } =
  vi.hoisted(() => {
    const session = {
      id: 's1',
      title: 'My Session',
      createdAt: new Date('2026-06-15T10:00:00Z'),
      updatedAt: new Date('2026-06-15T11:00:00Z'),
      messageCount: 3,
      isSidechain: false,
    };
    return {
      session,
      groupedOne: { today: [session], yesterday: [], pastWeek: [], pastMonth: [], pastYear: [] },
      emptyGroups: { today: [], yesterday: [], pastWeek: [], pastMonth: [], pastYear: [] },
      mockOpenNewTab: vi.fn(),
      mockOpenSession: vi.fn(),
      mockLoadSessions: vi.fn(),
      mockUseSessionList: vi.fn(),
      mockUseSessionContext: vi.fn(),
    };
  });

vi.mock('@/contexts/SessionContext', () => ({
  useSessionContext: mockUseSessionContext,
}));

vi.mock('@/adapters', () => ({
  getAdapter: () => ({ openSession: mockOpenSession }),
}));

vi.mock('@/components/SessionList/useSessionList', () => ({
  useSessionList: mockUseSessionList,
}));

function listResult(overrides = {}) {
  return {
    currentSessionId: null,
    searchQuery: '',
    setSearchQuery: vi.fn(),
    filteredSessions: [session],
    groupedSessions: groupedOne,
    handleDeleteSession: vi.fn(),
    renameSession: vi.fn(),
    confirmDialog: null,
    ...overrides,
  };
}

describe('SessionPanelPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOpenSession.mockResolvedValue(undefined);
    mockUseSessionContext.mockReturnValue({
      openNewTab: mockOpenNewTab,
      loadSessions: mockLoadSessions,
      sessionsServiceError: null,
    });
    mockUseSessionList.mockReturnValue(listResult());
  });

  it('renders the session title', () => {
    render(<SessionPanelPage />);
    expect(screen.getByText('My Session')).toBeDefined();
  });

  it('opens the clicked session in a new tab via the adapter', () => {
    render(<SessionPanelPage />);
    fireEvent.click(screen.getByRole('button', { name: /My Session/i }));
    expect(mockOpenSession).toHaveBeenCalledWith('s1');
  });

  it('방향키로 세션을 하이라이트하고 Enter로 새 탭에서 연다', () => {
    render(<SessionPanelPage />);
    const searchInput = screen.getByPlaceholderText('Search sessions...');

    // -1 → 0 (My Session)
    fireEvent.keyDown(searchInput, { key: 'ArrowDown' });
    fireEvent.keyDown(searchInput, { key: 'Enter' });

    expect(mockOpenSession).toHaveBeenCalledWith('s1');
  });

  it('Cmd/Ctrl+Shift+P로 세션 목록을 새로고침한다', () => {
    render(<SessionPanelPage />);
    fireEvent.keyDown(window, { key: 'P', ctrlKey: true, shiftKey: true });
    expect(mockLoadSessions).toHaveBeenCalledTimes(1);
  });

  it('opens a new session when "New session" is clicked', () => {
    render(<SessionPanelPage />);
    fireEvent.click(screen.getByRole('button', { name: /New session/i }));
    expect(mockOpenNewTab).toHaveBeenCalledTimes(1);
  });

  it('shows the web empty state when the Web tab is selected', () => {
    render(<SessionPanelPage />);
    expect(screen.queryByText('No web sessions')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Web' }));
    expect(screen.getByText('No web sessions')).toBeDefined();
    expect(screen.queryByText('My Session')).toBeNull();
  });

  it('shows "No sessions yet" for an empty local list with no service error', () => {
    mockUseSessionList.mockReturnValue(listResult({ filteredSessions: [], groupedSessions: emptyGroups }));
    render(<SessionPanelPage />);
    expect(screen.getByText('No sessions yet')).toBeDefined();
  });

  it('shows WSL guidance instead of "No sessions yet" when the backend reports a host mismatch', () => {
    mockUseSessionContext.mockReturnValue({
      openNewTab: mockOpenNewTab,
      loadSessions: mockLoadSessions,
      sessionsServiceError: { type: MessageType.WSL_HOST_MISMATCH, reason: 'inside WSL' },
    });
    mockUseSessionList.mockReturnValue(listResult({ filteredSessions: [], groupedSessions: emptyGroups }));

    render(<SessionPanelPage />);

    expect(screen.getByText(/WSL/)).toBeDefined();
    expect(screen.queryByText('No sessions yet')).toBeNull();
  });

  // The panel reads a list the app fetches once on connect, so an empty list
  // means either "there are none" or "they have not arrived". Saying the first
  // while the second is true tells the user something untrue.
  it('says the sessions are loading rather than "No sessions yet" while the list is being fetched', () => {
    mockUseSessionContext.mockReturnValue({
      openNewTab: mockOpenNewTab,
      loadSessions: mockLoadSessions,
      sessionsServiceError: null,
      isLoading: true,
    });
    mockUseSessionList.mockReturnValue(listResult({ filteredSessions: [], groupedSessions: emptyGroups }));

    render(<SessionPanelPage />);

    expect(screen.getByText('Loading sessions...')).toBeDefined();
    expect(screen.queryByText('No sessions yet')).toBeNull();
  });
});
