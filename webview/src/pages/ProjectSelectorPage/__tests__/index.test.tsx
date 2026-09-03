import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MessageType } from '@/shared';

vi.mock('@/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts?.count != null ? `${key}:${String(opts.count)}` : key,
  }),
}));

const setWorkingDirectory = vi.fn();
vi.mock('@/contexts', () => ({
  useWorkingDir: () => ({ setWorkingDirectory }),
}));

type Listener = (message: { payload?: Record<string, unknown> }) => void;
const listeners = new Map<string, Listener>();
const send = vi.fn();

// Defined once at module scope, not rebuilt per render: the page subscribes in
// an effect keyed on `subscribe`, so a fresh function each render would make it
// resubscribe forever.
const subscribe = (type: string, cb: Listener) => {
  listeners.set(type, cb);
  return () => listeners.delete(type);
};

vi.mock('../../../contexts/BridgeContext', () => ({
  useBridgeContext: () => ({ send, isConnected: true, subscribe }),
}));

import { ProjectSelectorPage, filterProjects, sortFavoritesFirst } from '../index';

const PROJECTS = [
  { name: 'proj2', path: '/Users/me/work/a/proj2', sessionCount: 4, lastModified: '2026-09-03T00:00:00.000Z' },
  { name: 'proj2', path: '/Users/me/work/b/proj2', sessionCount: 2, lastModified: '2026-09-02T00:00:00.000Z' },
  { name: 'ccg-demo', path: '/private/tmp/ccg-demo', sessionCount: 145, lastModified: '2026-09-01T00:00:00.000Z' },
];

/** Render, then deliver the PROJECTS_LIST the backend would have sent. */
async function renderWithProjects(
  projects = PROJECTS,
  homeDir: string | null = '/Users/me',
  favoritePaths: string[] = [],
) {
  render(<ProjectSelectorPage />);
  await waitFor(() => expect(listeners.has(MessageType.PROJECTS_LIST)).toBe(true));
  await act(async () => {
    listeners.get(MessageType.PROJECTS_LIST)!({ payload: { projects, homeDir, favoritePaths } });
  });
  await screen.findByPlaceholderText('searchPlaceholder');
}

function starFor(index: number): HTMLElement {
  return screen.getAllByRole('button', { name: /Favorite$/ })[index];
}

function rowTexts(): string[] {
  return screen
    .getAllByRole('button')
    .filter((b) => b.querySelector('span[aria-hidden]'))
    .map((b) => b.textContent ?? '');
}

describe('ProjectSelectorPage', () => {
  beforeEach(() => {
    listeners.clear();
    // Reset, not clear: a rejection set up by one case would otherwise stay on
    // the mock and fail the next case's initial GET_PROJECTS.
    send.mockReset();
    send.mockResolvedValue({});
    setWorkingDirectory.mockClear();
  });

  it('lists every project, not a windowful', async () => {
    await renderWithProjects();
    expect(rowTexts()).toHaveLength(3);
  });

  // The home prefix is the run of characters every row shares, so it is the
  // first thing to give up when a row runs out of width.
  it('shortens the home directory to a tilde and leaves other paths alone', async () => {
    await renderWithProjects();

    expect(screen.getByText('~/work/a/proj2')).toBeTruthy();
    expect(screen.getByText('/private/tmp/ccg-demo')).toBeTruthy();
  });

  it('shows the full path so same-named projects can be told apart', async () => {
    await renderWithProjects();

    expect(screen.getByText('~/work/a/proj2')).toBeTruthy();
    expect(screen.getByText('~/work/b/proj2')).toBeTruthy();
  });

  it('filters by name', async () => {
    await renderWithProjects();
    fireEvent.change(screen.getByPlaceholderText('searchPlaceholder'), {
      target: { value: 'ccg' },
    });

    expect(rowTexts()).toHaveLength(1);
    expect(screen.getByText('/private/tmp/ccg-demo')).toBeTruthy();
  });

  it('filters by path, which is the only thing separating same-named projects', async () => {
    await renderWithProjects();
    fireEvent.change(screen.getByPlaceholderText('searchPlaceholder'), {
      target: { value: 'work/b' },
    });

    expect(rowTexts()).toHaveLength(1);
    expect(screen.getByText('~/work/b/proj2')).toBeTruthy();
  });

  // Someone reading "~/work/a" on screen and typing it is searching for what
  // they can see, not for the absolute path underneath.
  it('filters by the abbreviated path as shown', async () => {
    await renderWithProjects();
    fireEvent.change(screen.getByPlaceholderText('searchPlaceholder'), {
      target: { value: '~/work/a' },
    });

    expect(rowTexts()).toHaveLength(1);
  });

  it('says so when nothing matches', async () => {
    await renderWithProjects();
    fireEvent.change(screen.getByPlaceholderText('searchPlaceholder'), {
      target: { value: 'nothing-here' },
    });

    expect(rowTexts()).toHaveLength(0);
    expect(screen.getByText('noMatches')).toBeTruthy();
  });

  it('moves the cursor with the arrow keys and opens with Enter', async () => {
    await renderWithProjects();
    const search = screen.getByPlaceholderText('searchPlaceholder');

    fireEvent.keyDown(search, { key: 'ArrowDown' });
    fireEvent.keyDown(search, { key: 'ArrowDown' });
    fireEvent.keyDown(search, { key: 'Enter' });

    expect(setWorkingDirectory).toHaveBeenCalledWith('/private/tmp/ccg-demo', { replace: false });
  });

  it('wraps the cursor around at the top', async () => {
    await renderWithProjects();
    const search = screen.getByPlaceholderText('searchPlaceholder');

    fireEvent.keyDown(search, { key: 'ArrowUp' });
    fireEvent.keyDown(search, { key: 'Enter' });

    expect(setWorkingDirectory).toHaveBeenCalledWith('/private/tmp/ccg-demo', { replace: false });
  });

  // Narrowing the list can strand the cursor past the end of it; Enter must not
  // then open whatever row used to be there.
  it('brings the cursor back into range when the list narrows under it', async () => {
    await renderWithProjects();
    const search = screen.getByPlaceholderText('searchPlaceholder');

    fireEvent.keyDown(search, { key: 'ArrowDown' });
    fireEvent.keyDown(search, { key: 'ArrowDown' });
    fireEvent.change(search, { target: { value: 'ccg' } });
    fireEvent.keyDown(search, { key: 'Enter' });

    expect(setWorkingDirectory).toHaveBeenCalledWith('/private/tmp/ccg-demo', { replace: false });
  });

  it('opens the project that was clicked', async () => {
    await renderWithProjects();

    const rows = screen.getAllByRole('button').filter((b) => b.querySelector('span[aria-hidden]'));
    fireEvent.click(rows[1]);

    expect(setWorkingDirectory).toHaveBeenCalledWith('/Users/me/work/b/proj2', { replace: false });
  });

  it('shows the full path when the backend sends no home directory', async () => {
    await renderWithProjects(PROJECTS, null);

    expect(screen.getByText('/Users/me/work/a/proj2')).toBeTruthy();
  });

  describe('pinning', () => {
    it('lifts pinned projects to the top, whatever their recency', async () => {
      // ccg-demo is last by recency; pinning must put it first.
      await renderWithProjects(PROJECTS, '/Users/me', ['/private/tmp/ccg-demo']);

      expect(rowTexts()[0]).toContain('ccg-demo');
    });

    it('keeps the backend order inside each group', async () => {
      await renderWithProjects(PROJECTS, '/Users/me', ['/private/tmp/ccg-demo']);

      const texts = rowTexts();
      expect(texts[1]).toContain('~/work/a/proj2');
      expect(texts[2]).toContain('~/work/b/proj2');
    });

    it('asks the backend to pin when the star is clicked', async () => {
      await renderWithProjects();
      send.mockResolvedValue({ status: 'ok', favoritePaths: ['/Users/me/work/a/proj2'] });

      await act(async () => {
        fireEvent.click(starFor(0));
      });

      expect(send).toHaveBeenCalledWith(MessageType.SET_PROJECT_FAVORITE, {
        path: '/Users/me/work/a/proj2',
        favorite: true,
      });
    });

    it('asks to unpin when the star of a pinned project is clicked', async () => {
      await renderWithProjects(PROJECTS, '/Users/me', ['/Users/me/work/a/proj2']);
      send.mockResolvedValue({ status: 'ok', favoritePaths: [] });

      await act(async () => {
        fireEvent.click(starFor(0));
      });

      expect(send).toHaveBeenCalledWith(MessageType.SET_PROJECT_FAVORITE, {
        path: '/Users/me/work/a/proj2',
        favorite: false,
      });
    });

    // The star sits inside the row; clicking it must not also open the project.
    it('does not open the project when the star is clicked', async () => {
      await renderWithProjects();
      send.mockResolvedValue({ status: 'ok', favoritePaths: ['/Users/me/work/a/proj2'] });

      await act(async () => {
        fireEvent.click(starFor(0));
      });

      expect(setWorkingDirectory).not.toHaveBeenCalled();
    });

    it('settles on the list the backend stored, not the one it drew', async () => {
      await renderWithProjects();
      // Another window pinned something too; the reply is the truth.
      send.mockResolvedValue({
        status: 'ok',
        favoritePaths: ['/Users/me/work/a/proj2', '/private/tmp/ccg-demo'],
      });

      await act(async () => {
        fireEvent.click(starFor(0));
      });

      const texts = rowTexts();
      expect(texts[0]).toContain('~/work/a/proj2');
      expect(texts[1]).toContain('ccg-demo');
    });

    // A refused write comes back with the list as it still stands on disk, so
    // the screen must not keep claiming a pin that was never saved.
    it('drops the star again when the backend refused the write', async () => {
      await renderWithProjects();
      send.mockResolvedValue({ status: 'error', favoritePaths: [] });

      await act(async () => {
        fireEvent.click(starFor(0));
      });

      expect(starFor(0).getAttribute('aria-pressed')).toBe('false');
    });

    it('drops the star again when the request itself failed', async () => {
      await renderWithProjects();
      send.mockRejectedValue(new Error('socket closed'));

      await act(async () => {
        fireEvent.click(starFor(0));
      });

      expect(starFor(0).getAttribute('aria-pressed')).toBe('false');
    });

    it('marks a pinned row as pressed', async () => {
      await renderWithProjects(PROJECTS, '/Users/me', ['/private/tmp/ccg-demo']);

      expect(starFor(0).getAttribute('aria-pressed')).toBe('true');
      expect(starFor(1).getAttribute('aria-pressed')).toBe('false');
    });
  });
});

describe('sortFavoritesFirst', () => {
  it('leaves the order alone when nothing is pinned', () => {
    expect(sortFavoritesFirst(PROJECTS, []).map((p) => p.path)).toEqual(
      PROJECTS.map((p) => p.path),
    );
  });

  // The pin is stored as it was spelled when pinned; the listed path can be
  // spelled differently for the same directory.
  it('matches a pin spelled with the other separator', () => {
    const projects = [
      { name: 'a', path: '/Users/me/a', sessionCount: 1, lastModified: '' },
      { name: 'b', path: 'C:\\Users\\me\\b', sessionCount: 1, lastModified: '' },
    ];

    expect(sortFavoritesFirst(projects, ['C:/Users/me/b']).map((p) => p.name)).toEqual(['b', 'a']);
  });

  it('ignores a pin for a project that is no longer listed', () => {
    expect(sortFavoritesFirst(PROJECTS, ['/Users/me/gone']).map((p) => p.path)).toEqual(
      PROJECTS.map((p) => p.path),
    );
  });
});

describe('filterProjects', () => {
  it('returns everything for a blank query', () => {
    expect(filterProjects(PROJECTS, '   ', '/Users/me')).toHaveLength(3);
  });

  it('ignores case', () => {
    expect(filterProjects(PROJECTS, 'CCG-DEMO', '/Users/me')).toHaveLength(1);
  });
});
