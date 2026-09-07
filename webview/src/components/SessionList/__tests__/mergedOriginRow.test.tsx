import { describe, it, expect, vi, beforeEach } from 'vitest';
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

// How many directories the backend said the list spans. Null is the default so
// the tests above this one keep exercising the local fallback.
let mockScopeDirCount: number | null = null;
vi.mock('@/contexts/SessionContext', () => ({
  useSessionContextOrNull: () => ({ scopeDirCount: mockScopeDirCount }),
}));

beforeEach(() => {
  mockRootDir = ROOT;
  mockScopeDirCount = null;
});

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

/**
 * Whether the list is merged is answered by the backend, which walked the
 * directories, rather than guessed from the rows currently held.
 *
 * The rows cannot answer it once the list is paged: sessions arrive
 * newest-first, so a first page can be entirely the anchor's own while every
 * sub-project sits further down. Guessing from the rows made a merged list
 * render with no labels at all until it was scrolled far enough.
 */
describe('SessionList — deciding whether directories are merged', () => {
  it('labels the rows when the scope spans directories the page has not reached', () => {
    // Exactly the reported case: nested listing is on and the backend found two
    // directories, but both of THIS page's rows belong to the anchor.
    mockScopeDirCount = 2;
    renderList([session('a', 'root session', ROOT), session('b', 'another', ROOT)]);

    expect(screen.getAllByText('repo')).toHaveLength(2);
  });

  it('leaves the rows unlabelled when every session in scope sits in one directory', () => {
    // Merging can be switched on while the anchor has no sub-project holding a
    // session. Nothing needs disambiguating, so no row spends a second line.
    mockScopeDirCount = 1;
    renderList([session('a', 'root session', ROOT), session('b', 'another', ROOT)]);

    expect(screen.queryByText('repo')).not.toBeInTheDocument();
  });

  it('falls back to the loaded rows when the backend reported no scope', () => {
    // An older backend says nothing. The rows are then the only evidence there
    // is, which is no worse than the guess this replaced.
    mockScopeDirCount = null;
    renderList([
      session('a', 'root session', ROOT),
      session('b', 'nested session', `${ROOT}/webview`),
    ]);

    expect(screen.getByText('webview')).toBeInTheDocument();
  });
});
