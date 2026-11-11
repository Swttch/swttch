import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { SessionList } from '../index';
import { SessionMetaDto } from '@/dto';
import { SessionGroup, type GroupedSessions } from '../utils';
import { isArchivedMark } from '../archive';

let mockInstalled: string | null = '0.4.0';
let mockActivity: Record<string, string> = {};
let mockOpen = new Set<string>();
vi.mock('@/hooks/queries/useSessionMcp', () => ({
  useSessionMcp: () => ({ info: { installed: mockInstalled } }),
}));

vi.mock('@/contexts/WorkingDirContext', () => ({
  useWorkingDirOrNull: () => ({ rootDir: '/repo' }),
}));

const setSessionArchived = vi.fn();
vi.mock('@/contexts/SessionContext', () => ({
  useSessionContextOrNull: () => ({ scopeDirCount: null, setSessionArchived }),
}));

vi.mock('@/hooks/useSessionActivity', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/useSessionActivity')>()),
  useSessionActivity: () => ({ activity: mockActivity, open: mockOpen, markRead: vi.fn() }),
}));

beforeEach(() => {
  mockInstalled = '0.4.0';
  mockActivity = {};
  mockOpen = new Set<string>();
  setSessionArchived.mockReset();
});

function session(id: string, title: string, mark?: Record<string, unknown>): SessionMetaDto {
  return Object.assign(new SessionMetaDto(), {
    id,
    title,
    sessionDir: '/repo',
    createdAt: new Date(0),
    updatedAt: new Date(0),
    messageCount: 1,
    isSidechain: false,
    ...(mark ? { sessionMark: { id, ...mark } } : {}),
  });
}

function grouped(sessions: SessionMetaDto[]): GroupedSessions {
  return {
    [SessionGroup.Today]: sessions,
    [SessionGroup.Yesterday]: [],
    [SessionGroup.PastWeek]: [],
    [SessionGroup.PastMonth]: [],
    [SessionGroup.PastYear]: [],
  };
}

function renderList(sessions: SessionMetaDto[]) {
  render(
    <SessionList
      groupedSessions={grouped(sessions)}
      currentSessionId={null}
      onSelectSession={vi.fn()}
      onDeleteSession={vi.fn()}
      onRenameSession={vi.fn()}
    />,
  );
}

const LIVE = session('live', 'A live session');
const ARCHIVED = session('old', 'An archived session', { archivedAt: 1794301002844 });
const ARCHIVED_IN_DESKTOP = session('desk', 'Archived in the desktop app', { archivedAt: 0, desktopArchived: true });

describe('which sessions are archived', () => {
  it('follows what the package recorded, and the desktop app only where the package chose nothing', () => {
    expect(isArchivedMark({ archivedAt: 1794301002844 })).toBe(true);
    expect(isArchivedMark({ archivedAt: 0, desktopArchived: true })).toBe(true);
    expect(isArchivedMark({ desktopArchived: true })).toBe(true);
    expect(isArchivedMark({ archivedAt: 0 })).toBe(false);
    expect(isArchivedMark(undefined)).toBe(false);
  });

  it('does not show a session archived that was brought back on purpose, whatever the desktop app says', () => {
    expect(isArchivedMark({ archivedAt: -1, desktopArchived: true })).toBe(false);
  });
});

describe('SessionList - archived sessions', () => {
  it('leaves archived sessions out until they are asked for', () => {
    renderList([LIVE, ARCHIVED, ARCHIVED_IN_DESKTOP]);
    expect(screen.getByText('A live session')).toBeInTheDocument();
    expect(screen.queryByText('An archived session')).toBeNull();
    expect(screen.queryByText('Archived in the desktop app')).toBeNull();
  });

  it('lists them with the rest when the toggle at the end of the filter bar is on', () => {
    renderList([LIVE, ARCHIVED, ARCHIVED_IN_DESKTOP]);
    const toggle = screen.getByTestId('session-archived-filter');
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('An archived session')).toBeInTheDocument();
    expect(screen.getByText('Archived in the desktop app')).toBeInTheDocument();
    fireEvent.click(toggle);
    expect(screen.queryByText('An archived session')).toBeNull();
  });

  it('puts the toggle at the far end of the bar, after the other filters', () => {
    renderList([LIVE]);
    const bar = screen.getByTestId('session-archived-filter').parentElement as HTMLElement;
    expect(bar.lastElementChild).toBe(screen.getByTestId('session-archived-filter'));
    expect(screen.getByTestId('session-archived-filter').className).toContain('ms-auto');
  });

  it('draws an archived row faint, and a live row as it was', () => {
    renderList([LIVE, ARCHIVED]);
    fireEvent.click(screen.getByTestId('session-archived-filter'));
    const faint = (title: string) => screen.getByText(title).closest('[data-archived], span.flex-1') as HTMLElement;
    expect(screen.getByText('An archived session').closest('[data-archived]')).not.toBeNull();
    expect(screen.getByText('An archived session').closest('[data-archived]')!.className).toContain('opacity-30');
    expect(screen.getByText('A live session').closest('[data-archived]')).toBeNull();
    expect(faint('A live session').className).not.toContain('opacity-30');
  });

  it('archives a live session from the button between rename and delete', () => {
    renderList([LIVE]);
    const row = screen.getByText('A live session').closest('button') as HTMLElement;
    fireEvent.mouseEnter(row);
    const buttons = [...row.querySelectorAll('[role="button"]')];
    expect(buttons).toHaveLength(3);
    expect(buttons[1]).toBe(screen.getByTestId('session-archive'));
    fireEvent.click(screen.getByTestId('session-archive'));
    expect(setSessionArchived).toHaveBeenCalledWith('live', true);
  });

  it('brings an archived session back from the same place, without opening it', () => {
    const onSelect = vi.fn();
    render(
      <SessionList
        groupedSessions={grouped([ARCHIVED])}
        currentSessionId={null}
        onSelectSession={onSelect}
        onDeleteSession={vi.fn()}
        onRenameSession={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId('session-archived-filter'));
    fireEvent.mouseEnter(screen.getByText('An archived session').closest('button') as HTMLElement);
    fireEvent.click(screen.getByTestId('session-unarchive'));
    expect(setSessionArchived).toHaveBeenCalledWith('old', false);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('has neither the toggle nor the archive button while the package is not installed', () => {
    mockInstalled = null;
    renderList([LIVE]);
    expect(screen.queryByTestId('session-archived-filter')).toBeNull();
    fireEvent.mouseEnter(screen.getByText('A live session').closest('button') as HTMLElement);
    expect(screen.queryByTestId('session-archive')).toBeNull();
  });

  it('counts only what is on screen: an archived session that is running is counted once the archived ones are shown', () => {
    mockActivity = { live: 'running', old: 'running' };
    mockOpen = new Set(['live', 'old']);
    renderList([LIVE, ARCHIVED]);
    const active = screen.getByTestId('session-active-filter');
    expect(active.textContent).toContain('1');
    fireEvent.click(screen.getByTestId('session-archived-filter'));
    expect(screen.getByTestId('session-active-filter').textContent).toContain('2');
  });
});
