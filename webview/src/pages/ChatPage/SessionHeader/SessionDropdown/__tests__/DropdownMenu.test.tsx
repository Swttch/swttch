import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DropdownMenu } from '../DropdownMenu';
import { SessionGroup, GroupedSessions } from '@/components/SessionList/utils';
import { MessageType } from '@/shared';

// DropdownMenu renders SearchInput → SessionRefresher, which needs SessionContext
// for isLoading/loadSessions. Mock it out since it's irrelevant to these tests.
vi.mock('@/contexts/SessionContext', () => ({
  useSessionContext: () => ({ isLoading: false, loadSessions: vi.fn() }),
}));

const emptyGroupedSessions: GroupedSessions = {
  [SessionGroup.Today]: [],
  [SessionGroup.Yesterday]: [],
  [SessionGroup.PastWeek]: [],
  [SessionGroup.PastMonth]: [],
  [SessionGroup.PastYear]: [],
};

describe('DropdownMenu', () => {
  const baseProps = {
    searchQuery: '',
    onSearchChange: vi.fn(),
    groupedSessions: emptyGroupedSessions,
    filteredSessionsCount: 0,
    currentSessionId: null,
    onSelectSession: vi.fn(),
    onDeleteSession: vi.fn(),
    onRenameSession: vi.fn(),
  };

  it('shows the WSL guidance instead of "no sessions yet" when the list is empty and sessionsServiceError is WSL_HOST_MISMATCH', () => {
    render(
      <DropdownMenu
        {...baseProps}
        sessionsServiceError={{ type: MessageType.WSL_HOST_MISMATCH, reason: 'inside WSL' }}
      />
    );

    expect(screen.queryByText('No sessions yet')).toBeNull();
    expect(
      screen.getByText('This project is in WSL. Open it from your WSL shell (run `ccg`) to see past conversations.')
    ).toBeDefined();
  });

  it('shows "no sessions yet" when the list is empty and there is no sessionsServiceError', () => {
    render(<DropdownMenu {...baseProps} sessionsServiceError={null} />);

    expect(screen.getByText('No sessions yet')).toBeDefined();
  });

  it('shows "no matching sessions" for a non-empty search query even when sessionsServiceError is WSL_HOST_MISMATCH', () => {
    render(
      <DropdownMenu
        {...baseProps}
        searchQuery="foo"
        sessionsServiceError={{ type: MessageType.WSL_HOST_MISMATCH, reason: 'inside WSL' }}
      />
    );

    expect(screen.getByText('No matching sessions')).toBeDefined();
    expect(
      screen.queryByText('This project is in WSL. Open it from your WSL shell (run `ccg`) to see past conversations.')
    ).toBeNull();
  });

  // The list is fetched once when the bridge connects, not when this menu
  // opens, so a user who opens it early sees an empty list. Claiming there are
  // no sessions at that moment states something the app has not found out yet.
  it('says the sessions are loading rather than "no sessions yet" while the list is being fetched', () => {
    render(<DropdownMenu {...baseProps} isLoading sessionsServiceError={null} />);

    expect(screen.getByText('Loading sessions...')).toBeDefined();
    expect(screen.queryByText('No sessions yet')).toBeNull();
  });

  it('keeps saying loading rather than "no matching sessions" when a search runs before the list arrives', () => {
    render(<DropdownMenu {...baseProps} isLoading searchQuery="foo" />);

    expect(screen.getByText('Loading sessions...')).toBeDefined();
    expect(screen.queryByText('No matching sessions')).toBeNull();
  });

  it('states the WSL guidance once loading has finished', () => {
    render(
      <DropdownMenu
        {...baseProps}
        isLoading={false}
        sessionsServiceError={{ type: MessageType.WSL_HOST_MISMATCH, reason: 'inside WSL' }}
      />
    );

    expect(screen.queryByText('Loading sessions...')).toBeNull();
    expect(
      screen.getByText('This project is in WSL. Open it from your WSL shell (run `ccg`) to see past conversations.')
    ).toBeDefined();
  });
});
