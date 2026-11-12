import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SessionList } from '../index';
import { SessionFamilies } from '../families';
import { canDropOnTopLevel, canDropUnder, readSessionDrag } from '../linkDragRules';
import { SessionMetaDto } from '@/dto';
import { SessionGroup, type GroupedSessions } from '../utils';

let sponsor = true;
let dragSetting = true;
let mcpInstalled: string | null = '0.4.0';

vi.mock('@/hooks/queries/useSessionMcp', () => ({
  useSessionMcp: () => ({ info: { installed: mcpInstalled } }),
}));
vi.mock('@/hooks/queries/useSponsorStatus', () => ({ useSponsorStatus: () => ({ isSponsor: sponsor }) }));
vi.mock('@/contexts/SettingsContext', () => ({
  useSettingsOrNull: () => ({ settings: { sessionListDragDrop: dragSetting } }),
}));
vi.mock('@/contexts/WorkingDirContext', () => ({ useWorkingDirOrNull: () => ({ rootDir: '/repo' }) }));
vi.mock('@/contexts/SessionContext', () => ({
  useSessionContextOrNull: () => ({ scopeDirCount: null, setSessionArchived: vi.fn(), setSessionParent: vi.fn() }),
}));
vi.mock('@/hooks/useSessionActivity', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/useSessionActivity')>()),
  useSessionActivity: () => ({ activity: {}, open: new Set<string>(), markRead: vi.fn() }),
}));

beforeEach(() => {
  sponsor = true;
  dragSetting = true;
  mcpInstalled = '0.4.0';
});

function session(id: string, parent?: string): SessionMetaDto {
  return Object.assign(new SessionMetaDto(), {
    id,
    title: `title ${id}`,
    sessionDir: '/repo',
    createdAt: new Date(0),
    updatedAt: new Date(0),
    messageCount: 1,
    isSidechain: false,
    ...(parent ? { sessionMark: { id, parentSessionUid: parent } } : {}),
  });
}

// a is the top one; b was started by a; c by b; d stands alone.
const ALL = [session('a'), session('b', 'a'), session('c', 'b'), session('d')];

function grouped(sessions: SessionMetaDto[]): GroupedSessions {
  return {
    [SessionGroup.Today]: sessions,
    [SessionGroup.Yesterday]: [],
    [SessionGroup.PastWeek]: [],
    [SessionGroup.PastMonth]: [],
    [SessionGroup.PastYear]: [],
  };
}

describe('where a dragged session may be dropped', () => {
  const families = SessionFamilies.of(ALL);

  it('puts a session under another one that is not itself, not already its parent, and not one it started', () => {
    expect(canDropUnder(families, 'd', 'a')).toBe(true);
    expect(canDropUnder(families, 'c', 'a')).toBe(true);
    expect(canDropUnder(families, 'd', 'd')).toBe(false);
    expect(canDropUnder(families, 'b', 'a')).toBe(false);
    expect(canDropUnder(families, 'a', 'b')).toBe(false);
    expect(canDropUnder(families, 'a', 'c')).toBe(false);
  });

  it('takes to the top level only a session that is under another one', () => {
    expect(canDropOnTopLevel(families, 'c')).toBe(true);
    expect(canDropOnTopLevel(families, 'a')).toBe(false);
    expect(canDropOnTopLevel(families, 'd')).toBe(false);
  });

  it('reads the session a drag carries, and nothing from data without one', () => {
    expect(readSessionDrag({ sessionId: 'x' })).toEqual({ sessionId: 'x' });
    expect(readSessionDrag({})).toBeNull();
    expect(readSessionDrag(undefined)).toBeNull();
  });
});

describe('SessionList - dragging sessions to change their links', () => {
  const renderList = () =>
    render(
      <SessionList
        groupedSessions={grouped(ALL)}
        currentSessionId={null}
        onSelectSession={vi.fn()}
        onDeleteSession={vi.fn()}
        onRenameSession={vi.fn()}
      />,
    );

  it('makes every row draggable, and puts the top-level strip in the list, for a sponsor with the setting on', () => {
    renderList();
    expect(screen.getAllByTestId('session-drag-row')).toHaveLength(ALL.length);
    expect(screen.getByTestId('session-top-level-drop')).toBeInTheDocument();
  });

  it.each([
    ['the setting is off', () => (dragSetting = false)],
    ['the person is not a sponsor', () => (sponsor = false)],
    ['the package is not installed', () => (mcpInstalled = null)],
  ])('draws the rows as before when %s', (_why, change) => {
    change();
    renderList();
    expect(screen.queryAllByTestId('session-drag-row')).toHaveLength(0);
    expect(screen.queryByTestId('session-top-level-drop')).toBeNull();
    expect(screen.getByText('title a')).toBeInTheDocument();
  });
});
