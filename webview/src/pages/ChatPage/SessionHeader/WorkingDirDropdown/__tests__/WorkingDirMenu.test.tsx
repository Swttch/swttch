import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { WorkingDirMenu } from '../WorkingDirMenu';
import { classifyWorkingDirs, WorkingDirEntry } from '../classifyWorkingDirs';

// Interpolate like the real `t` does. The collapse labels only differ by the
// folder name, so a mock that returns the bare key would make every toggle in
// the tree indistinguishable — to this test and to a screen reader alike.
vi.mock('@/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, string>) =>
      vars ? `${key}:${Object.values(vars).join(',')}` : key,
  }),
}));

const REPO = '/repo';

function entry(path: string, sessionCount = 1): WorkingDirEntry {
  return {
    name: path.split('/').pop() || path,
    path,
    sessionCount,
    lastModified: new Date(0).toISOString(),
  };
}

const ALL = [
  entry(REPO, 10),
  entry(`${REPO}/packages/battery`, 2),
  entry(`${REPO}/webview`, 3),
];

function renderMenu(overrides: Partial<Parameters<typeof WorkingDirMenu>[0]> = {}) {
  const props = {
    classified: classifyWorkingDirs(ALL, REPO, REPO),
    currentPath: REPO,
    selectedPath: REPO,
    ideRoot: REPO,
    isLoading: false,
    isRefreshing: false,
    onRefresh: vi.fn(),
    includeNested: false,
    onToggleIncludeNested: vi.fn(),
    onNavigate: vi.fn(),
    onAddWorkingDir: vi.fn(),
    ...overrides,
  };
  render(
    <MemoryRouter>
      <WorkingDirMenu {...props} />
    </MemoryRouter>,
  );
  return props;
}

describe('WorkingDirMenu — toolbar', () => {
  beforeEach(() => vi.clearAllMocks());

  it('refetches the list when the refresh button is pressed', () => {
    const props = renderMenu();

    fireEvent.click(screen.getByRole('button', { name: 'sessionHeader.workingDir.refreshTitle' }));

    expect(props.onRefresh).toHaveBeenCalledTimes(1);
  });

  it('ignores clicks while a fetch is already in flight', () => {
    // Without the guard a user hammering the button queues N overlapping
    // requests, and whichever resolves last wins — including a stale one.
    const props = renderMenu({ isRefreshing: true });

    fireEvent.click(screen.getByRole('button', { name: 'sessionHeader.workingDir.refreshTitle' }));

    expect(props.onRefresh).not.toHaveBeenCalled();
  });

  it('keeps the tree visible while refreshing so the menu does not blank out', () => {
    // `isLoading` only swaps in the placeholder on the very first load; a
    // refresh over an already-populated list must leave the rows on screen.
    renderMenu({ isRefreshing: true });

    expect(screen.getByText('webview')).toBeInTheDocument();
    expect(screen.queryByText('sessionHeader.workingDir.loading')).not.toBeInTheDocument();
  });
});

describe('WorkingDirMenu — include-nested toggle', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reports the flipped value when switched on', () => {
    const props = renderMenu({ includeNested: false });

    fireEvent.click(screen.getByRole('switch'));

    expect(props.onToggleIncludeNested).toHaveBeenCalledWith(true);
  });

  it('reports the flipped value when switched off', () => {
    const props = renderMenu({ includeNested: true });

    fireEvent.click(screen.getByRole('switch'));

    expect(props.onToggleIncludeNested).toHaveBeenCalledWith(false);
  });

  it('reflects the current setting in the switch state', () => {
    renderMenu({ includeNested: true });

    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
  });
});

describe('WorkingDirMenu — folding', () => {
  beforeEach(() => vi.clearAllMocks());

  it('hides a subtree when its parent row is collapsed', () => {
    renderMenu();

    expect(screen.getByText('battery')).toBeInTheDocument();

    // Fold `packages/`, not the repo root — the scaffold row is the direct
    // parent of the entry we expect to disappear.
    fireEvent.click(
      screen.getByRole('button', { name: 'sessionHeader.workingDir.collapseSubtree:packages' }),
    );

    expect(screen.queryByText('battery')).not.toBeInTheDocument();
    expect(screen.getByText('webview')).toBeInTheDocument();
  });

  it('names each toggle after its own folder so they are distinguishable', () => {
    renderMenu();

    const labels = screen
      .getAllByRole('button')
      .map((b) => b.getAttribute('aria-label'))
      .filter((l): l is string => !!l?.includes('collapseSubtree'));

    expect(labels).toEqual([
      'sessionHeader.workingDir.collapseSubtree:repo',
      'sessionHeader.workingDir.collapseSubtree:packages',
    ]);
  });
});
