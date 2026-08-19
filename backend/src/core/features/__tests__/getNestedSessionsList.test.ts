import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../getProjectsList', () => ({
  getProjectsList: vi.fn(),
}));

vi.mock('../getSessionsList', () => ({
  getSessionsList: vi.fn(),
}));

import { getNestedSessionsList } from '../getNestedSessionsList';
import { getProjectsList } from '../getProjectsList';
import { getSessionsList } from '../getSessionsList';

const mockProjects = vi.mocked(getProjectsList);
const mockSessions = vi.mocked(getSessionsList);

const ROOT = '/repo';

function project(path: string) {
  return { name: path.split('/').pop() ?? path, path, sessionCount: 1, lastModified: '' };
}

function session(sessionId: string, lastTimestamp: string) {
  return {
    sessionId,
    title: sessionId,
    lastTimestamp,
    createdAt: lastTimestamp,
    messageCount: 1,
    isSidechain: false,
  };
}

describe('getNestedSessionsList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSessions.mockResolvedValue([]);
  });

  it('reads the root and every working directory nested under it', async () => {
    mockProjects.mockResolvedValue([
      project(ROOT),
      project(`${ROOT}/packages/battery`),
      project(`${ROOT}/webview`),
      project('/elsewhere'),
    ]);

    await getNestedSessionsList(ROOT);

    const scanned = mockSessions.mock.calls.map(([dir]) => dir);
    expect(scanned).toEqual([ROOT, `${ROOT}/packages/battery`, `${ROOT}/webview`]);
  });

  it('does not scan a sibling that merely shares the name prefix', async () => {
    // `/repo-worktrees` is not inside `/repo`. A plain startsWith would pull a
    // whole unrelated worktree's sessions into the list.
    mockProjects.mockResolvedValue([project(ROOT), project('/repo-worktrees/issue-1')]);

    await getNestedSessionsList(ROOT);

    expect(mockSessions.mock.calls.map(([dir]) => dir)).toEqual([ROOT]);
  });

  it('scans the root once even when it is also in the projects list', async () => {
    mockProjects.mockResolvedValue([project(ROOT), project(ROOT)]);

    await getNestedSessionsList(ROOT);

    expect(mockSessions.mock.calls.filter(([dir]) => dir === ROOT)).toHaveLength(1);
  });

  it('tags every session with the directory it came from', async () => {
    mockProjects.mockResolvedValue([project(ROOT), project(`${ROOT}/webview`)]);
    mockSessions.mockImplementation(async (dir: string) =>
      dir === ROOT ? [session('root-a', '2026-01-01T00:00:00Z')] : [session('wv-a', '2026-01-02T00:00:00Z')],
    );

    const result = await getNestedSessionsList(ROOT);

    expect(result.map((s) => [s.sessionId, s.sessionDir])).toEqual([
      ['wv-a', `${ROOT}/webview`],
      ['root-a', ROOT],
    ]);
  });

  it('orders sessions across directories by recency, not by directory', async () => {
    // Each getSessionsList sorts only its own slice, so merging without a
    // re-sort would group by directory and bury the newest session.
    mockProjects.mockResolvedValue([project(ROOT), project(`${ROOT}/webview`)]);
    mockSessions.mockImplementation(async (dir: string) =>
      dir === ROOT
        ? [session('root-old', '2026-01-01T00:00:00Z'), session('root-new', '2026-01-05T00:00:00Z')]
        : [session('wv-mid', '2026-01-03T00:00:00Z')],
    );

    const result = await getNestedSessionsList(ROOT);

    expect(result.map((s) => s.sessionId)).toEqual(['root-new', 'wv-mid', 'root-old']);
  });
});
