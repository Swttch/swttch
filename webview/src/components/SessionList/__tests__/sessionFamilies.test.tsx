import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, renderHook, act } from '@testing-library/react';
import { plainToInstance } from 'class-transformer';
import { SessionList } from '../index';
import { useSessionList } from '../useSessionList';
import { SessionFamilies, SessionNesting } from '../families';
import { GROUP_ORDER, groupSessionsByDate, SessionGroup, type GroupedSessions } from '../utils';
import { SessionMarkDto, SessionMetaDto } from '@/dto';

/**
 * A session another session started is drawn under that session, the way the
 * Claude desktop app nests them. Who started whom comes from the row the
 * session-management MCP keeps (`sessionMark.parentSessionUid`).
 */

const NOW = new Date('2026-11-11T12:00:00Z');
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

interface Shape {
  /** The session that started this one. */
  startedBy?: string;
  /** Hours before NOW the session last moved. */
  hoursAgo?: number;
  /** When the package started it, as a plain number (smaller is earlier). */
  startedAt?: number;
}

function session(id: string, shape: Shape = {}): SessionMetaDto {
  const updatedAt = new Date(NOW.getTime() - (shape.hoursAgo ?? 1) * HOUR);
  return Object.assign(new SessionMetaDto(), {
    id,
    title: `title of ${id}`,
    sessionDir: '/repo',
    createdAt: updatedAt,
    updatedAt,
    messageCount: 1,
    isSidechain: false,
    sessionMark:
      shape.startedBy === undefined && shape.startedAt === undefined
        ? undefined
        : Object.assign(new SessionMarkDto(), {
            id,
            parentSessionUid: shape.startedBy ?? null,
            startedAt: shape.startedAt ?? 0,
          }),
  });
}

function idsOf(groups: GroupedSessions): string[] {
  return GROUP_ORDER.flatMap((key) => groups[key]).map((s) => s.id);
}

describe('SessionMetaDto — the session mark', () => {
  it('keeps the row as the package wrote it, unknown columns included', () => {
    const [row] = plainToInstance(SessionMetaDto, [
      {
        sessionId: 'child',
        title: 'Deploy',
        createdAt: '2026-11-10T00:00:00Z',
        lastTimestamp: '2026-11-10T00:00:00Z',
        sessionMark: {
          id: 'child',
          parentSessionUid: 'parent',
          startedAt: 7,
          archivedAt: 0,
          aColumnAddedLater: 'kept',
        },
      },
    ]);

    expect(row.sessionMark).toBeInstanceOf(SessionMarkDto);
    expect(row.sessionMark?.parentSessionUid).toBe('parent');
    expect(row.sessionMark?.startedAt).toBe(7);
    expect((row.sessionMark as unknown as Record<string, unknown>).aColumnAddedLater).toBe('kept');
  });

  it('leaves a session nobody recorded anything about without one', () => {
    const [row] = plainToInstance(SessionMetaDto, [
      { sessionId: 'plain', title: 'Plain', createdAt: '2026-11-10T00:00:00Z', lastTimestamp: null },
    ]);

    expect(row.sessionMark).toBeUndefined();
  });
});

describe('SessionFamilies', () => {
  it('draws a session under the session that started it', () => {
    const families = SessionFamilies.of([session('manager'), session('deploy', { startedBy: 'manager' })]);

    expect(families.topOf('deploy')).toBe('manager');
    expect(families.topOf('manager')).toBeNull();
    expect(families.membersOf('manager').map((s) => s.id)).toEqual(['deploy']);
  });

  it('lists the started sessions in the order they were started', () => {
    const families = SessionFamilies.of([
      session('manager'),
      session('third', { startedBy: 'manager', startedAt: 30, hoursAgo: 1 }),
      session('first', { startedBy: 'manager', startedAt: 10, hoursAgo: 2 }),
      session('second', { startedBy: 'manager', startedAt: 20, hoursAgo: 3 }),
    ]);

    expect(families.membersOf('manager').map((s) => s.id)).toEqual(['first', 'second', 'third']);
  });

  it('leaves a session alone when the one that started it is not on hand', () => {
    const families = SessionFamilies.of([session('deploy', { startedBy: 'a-manager-on-a-later-page' })]);

    expect(families.topOf('deploy')).toBeNull();
    expect(families.isEmpty).toBe(true);
  });

  it('draws a session started by a started session under the same top session', () => {
    const families = SessionFamilies.of([
      session('manager'),
      session('deploy', { startedBy: 'manager', startedAt: 10 }),
      session('verify', { startedBy: 'deploy', startedAt: 20 }),
    ]);

    expect(families.topOf('verify')).toBe('manager');
    expect(families.membersOf('manager').map((s) => s.id)).toEqual(['deploy', 'verify']);
    expect(families.membersOf('deploy')).toEqual([]);
  });

  it('keeps both rows when two records each claim the other started it', () => {
    const families = SessionFamilies.of([
      session('a', { startedBy: 'b' }),
      session('b', { startedBy: 'a' }),
    ]);

    expect(families.topOf('a')).toBeNull();
    expect(families.topOf('b')).toBeNull();
  });
});

describe('groupSessionsByDate — with families', () => {
  it('keeps the order it was given when no session started another', () => {
    const sessions = [session('b', { hoursAgo: 5 }), session('a', { hoursAgo: 1 })];

    expect(idsOf(groupSessionsByDate(sessions, NOW, SessionFamilies.of(sessions)))).toEqual(['b', 'a']);
  });

  it('puts the started sessions right after their starter', () => {
    const sessions = [
      session('other', { hoursAgo: 1 }),
      session('deploy', { startedBy: 'manager', hoursAgo: 2 }),
      session('manager', { hoursAgo: 3 }),
    ];

    const ids = idsOf(groupSessionsByDate(sessions, NOW, SessionFamilies.of(sessions)));

    expect(ids).toEqual(['other', 'manager', 'deploy']);
  });

  it('places the whole family where its most recent session belongs', () => {
    // The manager last moved four days ago; the session it started moved an
    // hour ago. The family belongs with today, above the session from yesterday.
    const sessions = [
      session('deploy', { startedBy: 'manager', hoursAgo: 1 }),
      session('yesterday', { hoursAgo: 30 }),
      session('manager', { hoursAgo: 4 * 24 }),
    ];

    const groups = groupSessionsByDate(sessions, NOW, SessionFamilies.of(sessions));

    expect(groups[SessionGroup.Today].map((s) => s.id)).toEqual(['manager', 'deploy']);
    expect(idsOf(groups)).toEqual(['manager', 'deploy', 'yesterday']);
    expect(NOW.getTime() - sessions[2].updatedAt.getTime()).toBe(4 * DAY);
  });

  it('leaves the started sessions out while their starter is folded', () => {
    const sessions = [session('manager'), session('deploy', { startedBy: 'manager' })];

    const ids = idsOf(
      groupSessionsByDate(sessions, NOW, SessionFamilies.of(sessions), new Set(['manager'])),
    );

    expect(ids).toEqual(['manager']);
  });
});

// ---------------------------------------------------------------------------
// The hook: what both surfaces (header dropdown, session panel) are handed.
// ---------------------------------------------------------------------------

const hookSessions: { current: SessionMetaDto[] } = { current: [] };

vi.mock('@/contexts/SessionContext', () => ({
  useSessionContext: () => ({
    sessions: hookSessions.current,
    currentSessionId: null,
    deleteSession: vi.fn(),
    renameSession: vi.fn(),
    loadMoreSessions: vi.fn(),
    loadAllSessions: vi.fn(),
    hasMoreSessions: false,
  }),
  useSessionContextOrNull: () => ({ scopeDirCount: null }),
}));

vi.mock('@/components/ConfirmDialog/useConfirmDialog', () => ({
  useConfirmDialog: () => ({ confirmDialog: null, confirm: vi.fn() }),
}));

vi.mock('@/contexts/WorkingDirContext', () => ({
  useWorkingDirOrNull: () => ({ rootDir: '/repo' }),
}));

vi.mock('@/hooks/useSessionActivity', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/useSessionActivity')>()),
  useSessionActivity: () => ({ activity: {}, open: new Set<string>(), markRead: vi.fn() }),
}));

describe('useSessionList — families', () => {
  beforeEach(() => {
    hookSessions.current = [
      Object.assign(session('manager', { hoursAgo: 1 }), { title: 'Release manager' }),
      Object.assign(session('deploy', { startedBy: 'manager', hoursAgo: 2 }), { title: 'Deploy the release' }),
      Object.assign(session('other', { hoursAgo: 3 }), { title: 'Something else' }),
    ];
  });

  it('arranges the rows by family and folds one on request', () => {
    const { result } = renderHook(() => useSessionList());

    expect(idsOf(result.current.groupedSessions)).toEqual(['manager', 'deploy', 'other']);
    expect(result.current.sessionNesting.families.topOf('deploy')).toBe('manager');

    act(() => result.current.sessionNesting.toggle('manager'));
    // The keyboard walks groupedSessions, so a folded row must not be in it.
    expect(idsOf(result.current.groupedSessions)).toEqual(['manager', 'other']);
    expect(result.current.sessionNesting.collapsed.has('manager')).toBe(true);

    act(() => result.current.sessionNesting.toggle('manager'));
    expect(idsOf(result.current.groupedSessions)).toEqual(['manager', 'deploy', 'other']);
  });

  it('shows a started session as an ordinary row when a search leaves its starter out', () => {
    const { result } = renderHook(() => useSessionList());

    act(() => result.current.setSearchQuery('Deploy'));

    expect(idsOf(result.current.groupedSessions)).toEqual(['deploy']);
    expect(result.current.sessionNesting.families.topOf('deploy')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// The rows.
// ---------------------------------------------------------------------------

function renderList(sessions: SessionMetaDto[], options: { collapsed?: string[]; onSelect?: () => void } = {}) {
  const families = SessionFamilies.of(sessions);
  const collapsed = new Set(options.collapsed ?? []);
  const toggle = vi.fn();
  const onSelect = options.onSelect ?? vi.fn();
  render(
    <SessionList
      groupedSessions={groupSessionsByDate(sessions, new Date(), families, collapsed)}
      currentSessionId={null}
      onSelectSession={onSelect}
      onDeleteSession={vi.fn()}
      onRenameSession={vi.fn()}
      nesting={new SessionNesting(families, collapsed, toggle)}
    />,
  );
  return { toggle, onSelect };
}

function recent(id: string, shape: Shape = {}): SessionMetaDto {
  // Relative to the real clock: the list groups by the time it is rendered at.
  const moved = new Date(Date.now() - (shape.hoursAgo ?? 0) * HOUR - 60_000);
  return Object.assign(session(id, shape), { createdAt: moved, updatedAt: moved });
}

describe('SessionList — sessions a session started', () => {
  it('indents a started session under its starter and leaves the others alone', () => {
    renderList([recent('manager'), recent('deploy', { startedBy: 'manager' }), recent('other')]);

    const started = screen.getAllByTestId('session-started-row');
    expect(started).toHaveLength(1);
    expect(started[0].getAttribute('data-started-by')).toBe('manager');
    expect(started[0].textContent).toContain('title of deploy');
  });

  it('gives only the session that started others the arrow', () => {
    renderList([recent('manager'), recent('deploy', { startedBy: 'manager' }), recent('other')]);

    const toggles = screen.getAllByTestId('session-started-toggle');
    expect(toggles).toHaveLength(1);
    expect(toggles[0].getAttribute('aria-expanded')).toBe('true');
    expect(toggles[0].closest('button')?.textContent).toContain('title of manager');
  });

  it('folds the family with the arrow without opening the session', () => {
    const { toggle, onSelect } = renderList([recent('manager'), recent('deploy', { startedBy: 'manager' })]);

    fireEvent.click(screen.getByTestId('session-started-toggle'));

    expect(toggle).toHaveBeenCalledWith('manager');
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('keeps the arrow on a folded starter, turned, with its sessions gone', () => {
    renderList([recent('manager'), recent('deploy', { startedBy: 'manager' })], { collapsed: ['manager'] });

    expect(screen.queryByTestId('session-started-row')).toBeNull();
    expect(screen.getByTestId('session-started-toggle').getAttribute('aria-expanded')).toBe('false');
  });

  it('draws nothing of the kind for a list where no session started another', () => {
    renderList([recent('a'), recent('b')]);

    expect(screen.queryByTestId('session-started-row')).toBeNull();
    expect(screen.queryByTestId('session-started-toggle')).toBeNull();
  });
});
