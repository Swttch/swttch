import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, renderHook, act } from '@testing-library/react';
import { plainToInstance } from 'class-transformer';
import { SessionList } from '../index';
import { useSessionList } from '../useSessionList';
import { SessionFamilies, SessionNesting, placeFamilyRows } from '../families';
import { GROUP_ORDER, groupSessionsByDate, SessionGroup, type GroupedSessions } from '../utils';
import { SessionMarkDto, SessionMetaDto } from '@/dto';

/**
 * A session another session started is drawn under that session, and a session
 * IT started under it in turn: the list shows the tree of who started whom. Who
 * started whom comes from the row the session-management MCP keeps
 * (`sessionMark.parentSessionUid`).
 *
 * The Claude desktop app flattens a family to one level under its top session.
 * That is deliberately not copied: it hides who started whom.
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

/**
 * A manager that started `deploy` and `review`; `deploy` started `verify`,
 * which started `report`:
 *
 *   manager
 *   ├ deploy
 *   │ └ verify
 *   │   └ report
 *   └ review
 */
function tree(): SessionMetaDto[] {
  return [
    session('manager'),
    session('deploy', { startedBy: 'manager', startedAt: 10 }),
    session('verify', { startedBy: 'deploy', startedAt: 20 }),
    session('report', { startedBy: 'verify', startedAt: 30 }),
    session('review', { startedBy: 'manager', startedAt: 40 }),
  ];
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

  it('keeps the whole title beside the one cut to fit a row', () => {
    const long = '7+7 one-line answer 7+7 one-line answer 7+7 one-line answer';
    const [row] = plainToInstance(SessionMetaDto, [
      { sessionId: 'long', title: long, createdAt: '2026-11-10T00:00:00Z', lastTimestamp: null },
    ]);

    expect(row.title).toBe(long.substring(0, 50));
    expect(row.fullTitle).toBe(long);
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

    expect(families.parentOf('deploy')).toBe('manager');
    expect(families.parentOf('manager')).toBeNull();
    expect(families.childrenOf('manager').map((s) => s.id)).toEqual(['deploy']);
  });

  it('lists the started sessions in the order they were started', () => {
    const families = SessionFamilies.of([
      session('manager'),
      session('third', { startedBy: 'manager', startedAt: 30, hoursAgo: 1 }),
      session('first', { startedBy: 'manager', startedAt: 10, hoursAgo: 2 }),
      session('second', { startedBy: 'manager', startedAt: 20, hoursAgo: 3 }),
    ]);

    expect(families.childrenOf('manager').map((s) => s.id)).toEqual(['first', 'second', 'third']);
  });

  it('leaves a session alone when the one that started it is not on hand', () => {
    const families = SessionFamilies.of([session('deploy', { startedBy: 'a-manager-on-a-later-page' })]);

    expect(families.parentOf('deploy')).toBeNull();
    expect(families.isEmpty).toBe(true);
  });

  it('keeps every level: a session started by a started session hangs under that one', () => {
    const families = SessionFamilies.of(tree());

    expect(families.parentOf('verify')).toBe('deploy');
    expect(families.parentOf('report')).toBe('verify');
    expect(families.childrenOf('manager').map((s) => s.id)).toEqual(['deploy', 'review']);
    expect(families.childrenOf('deploy').map((s) => s.id)).toEqual(['verify']);
  });

  it('walks a family in the order it is drawn, each session followed by what it started', () => {
    const families = SessionFamilies.of(tree());

    expect(families.descendantsOf('manager').map((s) => s.id)).toEqual([
      'deploy',
      'verify',
      'report',
      'review',
    ]);
    expect(families.descendantsOf('deploy').map((s) => s.id)).toEqual(['verify', 'report']);
  });

  it('stops at a folded session and goes on with the ones after it', () => {
    const families = SessionFamilies.of(tree());

    expect(families.descendantsOf('manager', new Set(['deploy'])).map((s) => s.id)).toEqual([
      'deploy',
      'review',
    ]);
  });

  it('lets the sessions under a missing starter keep what they started', () => {
    // `deploy` is not on hand (filtered out, or on a later page): `verify` can
    // no longer be tied to the manager, and stands on its own with `report`.
    const families = SessionFamilies.of(tree().filter((s) => s.id !== 'deploy'));

    expect(families.parentOf('verify')).toBeNull();
    expect(families.parentOf('report')).toBe('verify');
    expect(families.childrenOf('manager').map((s) => s.id)).toEqual(['review']);
  });

  it('keeps both rows when two records each claim the other started it', () => {
    const families = SessionFamilies.of([
      session('a', { startedBy: 'b' }),
      session('b', { startedBy: 'a' }),
    ]);

    expect(families.parentOf('a')).toBeNull();
    expect(families.parentOf('b')).toBeNull();
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

  it('lays a deep family out depth first', () => {
    const sessions = tree();

    const ids = idsOf(groupSessionsByDate(sessions, NOW, SessionFamilies.of(sessions)));

    expect(ids).toEqual(['manager', 'deploy', 'verify', 'report', 'review']);
  });

  it('places the whole family where its most recent session belongs, however deep that one is', () => {
    // The manager last moved four days ago; a session three levels down moved
    // an hour ago. The family belongs with today, above yesterday's session.
    const sessions = [
      session('report', { startedBy: 'verify', hoursAgo: 1 }),
      session('yesterday', { hoursAgo: 30 }),
      session('verify', { startedBy: 'deploy', hoursAgo: 3 * 24 }),
      session('deploy', { startedBy: 'manager', hoursAgo: 3 * 24 }),
      session('manager', { hoursAgo: 4 * 24 }),
    ];

    const groups = groupSessionsByDate(sessions, NOW, SessionFamilies.of(sessions));

    expect(groups[SessionGroup.Today].map((s) => s.id)).toEqual(['manager', 'deploy', 'verify', 'report']);
    expect(idsOf(groups)).toEqual(['manager', 'deploy', 'verify', 'report', 'yesterday']);
    expect(NOW.getTime() - sessions[4].updatedAt.getTime()).toBe(4 * DAY);
  });

  it('folds only what the folded session started', () => {
    const sessions = tree();
    const families = SessionFamilies.of(sessions);

    expect(idsOf(groupSessionsByDate(sessions, NOW, families, new Set(['deploy'])))).toEqual([
      'manager',
      'deploy',
      'review',
    ]);
    expect(idsOf(groupSessionsByDate(sessions, NOW, families, new Set(['manager'])))).toEqual(['manager']);
  });

  it('does not move a family when it is folded', () => {
    const sessions = [
      session('deploy', { startedBy: 'manager', hoursAgo: 1 }),
      session('yesterday', { hoursAgo: 30 }),
      session('manager', { hoursAgo: 4 * 24 }),
    ];

    const groups = groupSessionsByDate(sessions, NOW, SessionFamilies.of(sessions), new Set(['manager']));

    expect(groups[SessionGroup.Today].map((s) => s.id)).toEqual(['manager']);
  });
});

describe('placeFamilyRows', () => {
  function place(rows: SessionMetaDto[], drawn = rows.map((s) => s.id)) {
    const families = SessionFamilies.of(rows);
    const groups = groupSessionsByDate(rows, NOW, families);
    const ordered = GROUP_ORDER.flatMap((key) => groups[key]).filter((s) => drawn.includes(s.id));
    return placeFamilyRows(ordered, families, new Set(drawn));
  }

  it('gives a top session no placement', () => {
    expect(place(tree()).get('manager')).toBeUndefined();
  });

  it('counts the levels above each row', () => {
    const placements = place(tree());

    expect(placements.get('deploy')?.depth).toBe(1);
    expect(placements.get('verify')?.depth).toBe(2);
    expect(placements.get('report')?.depth).toBe(3);
    expect(placements.get('review')?.depth).toBe(1);
    expect(placements.get('report')?.parentId).toBe('verify');
  });

  it('ends a level on the last row drawn under the same session', () => {
    const placements = place(tree());

    // `review` follows `deploy` under the manager, so the first level goes on.
    expect(placements.get('deploy')?.isLast).toBe(false);
    expect(placements.get('review')?.isLast).toBe(true);
    // `verify` and `report` are each the only session their starter started.
    expect(placements.get('verify')?.isLast).toBe(true);
    expect(placements.get('report')?.isLast).toBe(true);
  });

  it('runs the line of a level through the deeper rows while that level goes on', () => {
    const placements = place(tree());

    // Level 1 goes on to `review`, so its line passes through both rows below
    // `deploy`. Level 2 ended at `verify`, so it does not reach `report`.
    expect(placements.get('verify')?.passing).toEqual([true]);
    expect(placements.get('report')?.passing).toEqual([true, false]);
    expect(placements.get('review')?.passing).toEqual([]);
  });

  it('hangs a row under the nearest row above it that is still drawn', () => {
    // A filter hid `deploy` and kept what is under it.
    const placements = place(tree(), ['manager', 'verify', 'report', 'review']);

    expect(placements.get('verify')?.parentId).toBe('manager');
    expect(placements.get('verify')?.depth).toBe(1);
    expect(placements.get('report')?.depth).toBe(2);
  });

  it('lets a row stand on its own when nothing above it is drawn', () => {
    const placements = place(tree(), ['verify', 'report']);

    expect(placements.get('verify')).toBeUndefined();
    expect(placements.get('report')?.depth).toBe(1);
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
      Object.assign(session('verify', { startedBy: 'deploy', hoursAgo: 2 }), { title: 'Verify the build' }),
      Object.assign(session('other', { hoursAgo: 3 }), { title: 'Something else' }),
    ];
  });

  it('arranges the rows by family and folds one level on request', () => {
    const { result } = renderHook(() => useSessionList());

    expect(idsOf(result.current.groupedSessions)).toEqual(['manager', 'deploy', 'verify', 'other']);
    expect(result.current.sessionNesting.families.parentOf('verify')).toBe('deploy');

    act(() => result.current.sessionNesting.toggle('deploy'));
    // The keyboard walks groupedSessions, so a folded row must not be in it.
    expect(idsOf(result.current.groupedSessions)).toEqual(['manager', 'deploy', 'other']);
    expect(result.current.sessionNesting.collapsed.has('deploy')).toBe(true);

    act(() => result.current.sessionNesting.toggle('deploy'));
    expect(idsOf(result.current.groupedSessions)).toEqual(['manager', 'deploy', 'verify', 'other']);
  });

  it('shows a started session as an ordinary row when a search leaves its starter out', () => {
    const { result } = renderHook(() => useSessionList());

    act(() => result.current.setSearchQuery('Deploy'));

    expect(idsOf(result.current.groupedSessions)).toEqual(['deploy']);
    expect(result.current.sessionNesting.families.parentOf('deploy')).toBeNull();
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

function recentTree(): SessionMetaDto[] {
  return [
    recent('manager'),
    recent('deploy', { startedBy: 'manager', startedAt: 10 }),
    recent('verify', { startedBy: 'deploy', startedAt: 20 }),
    recent('review', { startedBy: 'manager', startedAt: 30 }),
    recent('other'),
  ];
}

function startedRow(id: string): HTMLElement {
  const row = screen
    .getAllByTestId('session-started-row')
    .find((element) => element.textContent?.includes(`title of ${id}`));
  if (!row) throw new Error(`no started row for ${id}`);
  return row;
}

describe('SessionList — sessions a session started', () => {
  it('indents each started session under the one that started it, one step per level', () => {
    renderList(recentTree());

    expect(screen.getAllByTestId('session-started-row')).toHaveLength(3);
    expect(startedRow('deploy').getAttribute('data-started-by')).toBe('manager');
    expect(startedRow('deploy').getAttribute('data-depth')).toBe('1');
    expect(startedRow('verify').getAttribute('data-started-by')).toBe('deploy');
    expect(startedRow('verify').getAttribute('data-depth')).toBe('2');
    expect(startedRow('review').getAttribute('data-depth')).toBe('1');
  });

  it('draws one line per level that reaches the row', () => {
    renderList(recentTree());

    const linesIn = (id: string) => startedRow(id).querySelectorAll('[data-testid="session-tree-line"]').length;
    // `verify` sits two levels down and the first level goes on to `review`
    // below it: its own line and the passing one.
    expect(linesIn('verify')).toBe(2);
    expect(linesIn('deploy')).toBe(1);
    expect(linesIn('review')).toBe(1);
  });

  it('gives every session that started others its own arrow', () => {
    renderList(recentTree());

    const toggles = screen.getAllByTestId('session-started-toggle');
    const owners = toggles.map((toggle) => toggle.closest('button')?.textContent ?? '');
    expect(toggles).toHaveLength(2);
    expect(owners.some((text) => text.includes('title of manager'))).toBe(true);
    expect(owners.some((text) => text.includes('title of deploy'))).toBe(true);
    expect(toggles.every((toggle) => toggle.getAttribute('aria-expanded') === 'true')).toBe(true);
  });

  it('folds with the arrow of the row it sits on, without opening the session', () => {
    const { toggle, onSelect } = renderList(recentTree());

    const deployArrow = startedRow('deploy').querySelector('[data-testid="session-started-toggle"]');
    fireEvent.click(deployArrow as Element);

    expect(toggle).toHaveBeenCalledWith('deploy');
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('keeps the arrow on a folded session, turned, with what it started gone', () => {
    renderList(recentTree(), { collapsed: ['deploy'] });

    expect(screen.getAllByTestId('session-started-row')).toHaveLength(2);
    const deployArrow = startedRow('deploy').querySelector('[data-testid="session-started-toggle"]');
    expect(deployArrow?.getAttribute('aria-expanded')).toBe('false');
  });

  it('draws nothing of the kind for a list where no session started another', () => {
    renderList([recent('a'), recent('b')]);

    expect(screen.queryByTestId('session-started-row')).toBeNull();
    expect(screen.queryByTestId('session-started-toggle')).toBeNull();
  });
});
