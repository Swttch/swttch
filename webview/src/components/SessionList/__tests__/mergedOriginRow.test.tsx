import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SessionList } from '../index';
import { SessionMetaDto } from '@/dto';
import { SessionGroup, type GroupedSessions } from '../utils';

const ROOT = '/repo';

// i18n is deliberately NOT mocked: SessionList's utils reach for the `i18n`
// instance as well as `useTranslation`, and the strings asserted here are
// project paths, which are never translated.
let mockRootDir: string | null = ROOT;
vi.mock('@/contexts/WorkingDirContext', () => ({
  useWorkingDirOrNull: () => ({ rootDir: mockRootDir }),
}));

function session(id: string, title: string, sessionDir: string): SessionMetaDto {
  return Object.assign(new SessionMetaDto(), {
    id,
    title,
    sessionDir,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    messageCount: 1,
    isSidechain: false,
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

describe('SessionList — origin line while directories are merged', () => {
  it('labels every row, including the ones from the anchor itself', () => {
    mockRootDir = ROOT;
    renderList([
      session('a', 'root session', ROOT),
      session('b', 'nested session', `${ROOT}/packages/battery`),
    ]);

    expect(screen.getByText('repo')).toBeInTheDocument();
    expect(screen.getByText('packages/battery')).toBeInTheDocument();
  });

  it('shows no origin line when every session sits in the anchor', () => {
    // Merging can be switched on while the anchor has no sub-projects. Nothing
    // needs disambiguating then, so the rows stay single-line.
    mockRootDir = ROOT;
    renderList([session('a', 'root session', ROOT), session('b', 'another', ROOT)]);

    expect(screen.queryByText('repo')).not.toBeInTheDocument();
    expect(screen.getByText('root session')).toBeInTheDocument();
  });

  it('keeps the title readable rather than sharing its row with the origin', () => {
    mockRootDir = ROOT;
    renderList([session('b', 'nested session', `${ROOT}/packages/battery`)]);

    const title = screen.getByText('nested session');
    const origin = screen.getByText('packages/battery');

    // Both live in the same stacked container; neither is a sibling competing
    // for the title's horizontal space.
    expect(title.parentElement).toBe(origin.parentElement);
    expect(title.parentElement?.className).toContain('flex-col');
  });

  it('keeps the project line visible while the title is being renamed', () => {
    // Renaming used to replace the entire row, which took the project line with
    // it — losing exactly the context that says which of several same-named
    // conversations is being edited.
    mockRootDir = ROOT;
    renderList([session('b', 'nested session', `${ROOT}/packages/battery`)]);

    fireEvent.mouseEnter(screen.getByText('nested session').closest('button')!);
    fireEvent.click(screen.getByTitle('Rename session'));

    expect(screen.getByRole('textbox')).toHaveValue('nested session');
    expect(screen.getByText('packages/battery')).toBeInTheDocument();
  });

  it('bounds the text column so it cannot push the hover actions off the row', () => {
    // The column holds the truncation now that `truncate` moved onto the lines
    // inside it. Without an overflow bound it grows past the row and shoves the
    // rename/delete buttons out of view — they render, but land nowhere visible.
    mockRootDir = ROOT;
    renderList([session('b', 'nested session', `${ROOT}/packages/battery`)]);

    const column = screen.getByText('nested session').parentElement;
    expect(column?.className).toContain('min-w-0');
    expect(column?.className).toContain('overflow-hidden');
  });
});
