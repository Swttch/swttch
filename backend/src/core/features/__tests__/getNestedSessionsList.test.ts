import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../getProjectsList', () => ({
  getProjectsList: vi.fn(),
}));

vi.mock('../getSessionsList', () => ({
  collectSortKeys: vi.fn(),
  resolvePage: vi.fn(),
}));

import { getNestedSessionsList } from '../getNestedSessionsList';
import { getProjectsList } from '../getProjectsList';
import { collectSortKeys, resolvePage, type SessionSortKey } from '../getSessionsList';

const mockProjects = vi.mocked(getProjectsList);
const mockCollect = vi.mocked(collectSortKeys);
const mockResolve = vi.mocked(resolvePage);

const ROOT = '/repo';

function project(path: string) {
  return {
    name: path.split('/').pop() ?? path,
    path,
    sessionCount: 1,
    lastModified: '',
    createdAt: '',
  };
}

function key(sessionId: string, sessionDir: string, isoTime: string): SessionSortKey {
  return {
    sessionId,
    fullPath: `${sessionDir}/${sessionId}.jsonl`,
    sessionsPath: sessionDir,
    sessionDir,
    sortedAt: Date.parse(isoTime),
  };
}

/** The order resolvePage was handed, which is what the merge is judged on. */
function orderPassedToResolve(): string[] {
  const [keys] = mockResolve.mock.calls[0] ?? [[]];
  return (keys as SessionSortKey[]).map((k) => k.sessionId);
}

describe('getNestedSessionsList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCollect.mockResolvedValue([]);
    mockResolve.mockResolvedValue({ sessions: [], total: 0, hasMore: false });
  });

  it('reads the root and every working directory nested under it', async () => {
    mockProjects.mockResolvedValue([
      project(ROOT),
      project(`${ROOT}/packages/battery`),
      project(`${ROOT}/webview`),
      project('/elsewhere'),
    ]);

    await getNestedSessionsList(ROOT);

    const scanned = mockCollect.mock.calls.map(([dir]) => dir);
    expect(scanned).toEqual([ROOT, `${ROOT}/packages/battery`, `${ROOT}/webview`]);
  });

  it('does not scan a sibling that merely shares the name prefix', async () => {
    // `/repo-worktrees` is not inside `/repo`. A plain startsWith would pull a
    // whole unrelated worktree's sessions into the list.
    mockProjects.mockResolvedValue([project(ROOT), project('/repo-worktrees/issue-1')]);

    await getNestedSessionsList(ROOT);

    expect(mockCollect.mock.calls.map(([dir]) => dir)).toEqual([ROOT]);
  });

  it('scans the root once even when it is also in the projects list', async () => {
    mockProjects.mockResolvedValue([project(ROOT), project(ROOT)]);

    await getNestedSessionsList(ROOT);

    expect(mockCollect.mock.calls.filter(([dir]) => dir === ROOT)).toHaveLength(1);
  });

  it('orders sessions across directories by recency, not by directory', async () => {
    // Each directory is collected separately, so merging without a re-sort would
    // group by directory and bury the newest session.
    mockProjects.mockResolvedValue([project(ROOT), project(`${ROOT}/webview`)]);
    mockCollect.mockImplementation(async (dir: string) =>
      dir === ROOT
        ? [key('root-old', ROOT, '2026-01-01T00:00:00Z'), key('root-new', ROOT, '2026-01-05T00:00:00Z')]
        : [key('wv-mid', `${ROOT}/webview`, '2026-01-03T00:00:00Z')],
    );

    await getNestedSessionsList(ROOT);

    expect(orderPassedToResolve()).toEqual(['root-new', 'wv-mid', 'root-old']);
  });

  // The page has to be cut from the merged order. Cutting per directory first
  // would return each directory's newest few rather than the newest overall.
  it('orders every directory before the page is cut', async () => {
    mockProjects.mockResolvedValue([project(ROOT), project(`${ROOT}/webview`)]);
    mockCollect.mockImplementation(async (dir: string) =>
      dir === ROOT
        ? [key('root-a', ROOT, '2026-01-01T00:00:00Z')]
        : [key('wv-a', `${ROOT}/webview`, '2026-01-02T00:00:00Z')],
    );

    await getNestedSessionsList(ROOT, { limit: 1 });

    expect(orderPassedToResolve()).toEqual(['wv-a', 'root-a']);
    expect(mockResolve.mock.calls[0][1]).toEqual({ limit: 1 });
  });

  it('passes the paging options straight through', async () => {
    mockProjects.mockResolvedValue([project(ROOT)]);

    await getNestedSessionsList(ROOT, { offset: 20, limit: 20 });

    expect(mockResolve.mock.calls[0][1]).toEqual({ offset: 20, limit: 20 });
  });
});
