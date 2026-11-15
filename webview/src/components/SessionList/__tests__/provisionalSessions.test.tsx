import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { SessionList } from '../index';
import { SessionMetaDto } from '@/dto';
import { SessionGroup, type GroupedSessions } from '../utils';

vi.mock('@/hooks/queries/useSessionMcp', () => ({
  useSessionMcp: () => ({ info: { installed: '0.4.0' } }),
}));
vi.mock('@/contexts/WorkingDirContext', () => ({
  useWorkingDirOrNull: () => ({ rootDir: '/repo' }),
}));
vi.mock('@/contexts/SessionContext', () => ({
  useSessionContextOrNull: () => ({ scopeDirCount: null, setSessionArchived: vi.fn() }),
}));
vi.mock('@/hooks/useSessionActivity', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/useSessionActivity')>()),
  useSessionActivity: () => ({ activity: {}, open: new Set<string>(), markRead: vi.fn() }),
}));

function session(id: string, title: string, provisional = false): SessionMetaDto {
  return Object.assign(new SessionMetaDto(), {
    id,
    title,
    sessionDir: '/repo',
    createdAt: new Date(0),
    updatedAt: new Date(0),
    messageCount: 1,
    isSidechain: false,
    ...(provisional ? { provisional: true } : {}),
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

/**
 * A session that was just started is in the list before its transcript exists, and there is nothing to open
 * until the transcript does: opening it would load a session that is not on disk.
 */
describe('a session whose transcript does not exist yet', () => {
  it('is drawn in the list, and opens nothing when it is clicked', () => {
    const onSelectSession = vi.fn();
    render(
      <SessionList
        groupedSessions={grouped([session('ready', 'Ready one'), session('starting', 'Starting one', true)])}
        currentSessionId={null}
        onSelectSession={onSelectSession}
        onDeleteSession={vi.fn()}
        onRenameSession={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText('Starting one'));
    expect(onSelectSession).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('Ready one'));
    expect(onSelectSession).toHaveBeenCalledWith('ready');
  });
});
