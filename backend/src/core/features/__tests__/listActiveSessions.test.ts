import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../claude', () => ({
  Claude: { exec: vi.fn() },
}));
vi.mock('../getSessionEntry', () => ({
  getSessionEntry: vi.fn(),
}));

import { Claude } from '../../claude';
import { getSessionEntry } from '../getSessionEntry';
import { listActiveSessions } from '../listActiveSessions';

const mockExec = vi.mocked(Claude.exec);
const mockGetSessionEntry = vi.mocked(getSessionEntry);

/** A `claude agents --json` entry, shaped as the CLI actually prints one. */
function agent(overrides: Record<string, unknown> = {}) {
  return {
    pid: 53662,
    cwd: '/Users/me/proj',
    kind: 'interactive',
    startedAt: 1789378470591,
    sessionId: '458fa4b4-a049-48e7-b61b-43bf2f2d029e',
    name: 'proj-36',
    ...overrides,
  };
}

function entry(overrides: Record<string, unknown> = {}) {
  return {
    sessionId: '458fa4b4-a049-48e7-b61b-43bf2f2d029e',
    sessionDir: '/Users/me/proj',
    title: 'fix the thing',
    lastTimestamp: '2026-09-14T10:00:00.000Z',
    createdAt: '2026-09-14T09:00:00.000Z',
    messageCount: null,
    isSidechain: false,
    ...overrides,
  } as never;
}

/**
 * The list behind the `@@` composer panel.
 *
 * Two things are load-bearing here: the CLI's array must arrive unedited, and
 * each session must be named by the same row the session list would name it by.
 */
describe('listActiveSessions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSessionEntry.mockResolvedValue(null);
  });

  it('asks the official command, in the directory it was given', async () => {
    mockExec.mockResolvedValue({ stdout: '[]', stderr: '' });

    await listActiveSessions('/Users/me/proj');

    expect(mockExec).toHaveBeenCalledWith(
      ['agents', '--json'],
      expect.objectContaining({ cwd: '/Users/me/proj' }),
    );
  });

  it('carries every field the CLI printed, including ones we do not name', async () => {
    const raw = agent({ somethingNew: { nested: true }, hopChain: ['a', 'b'] });
    mockExec.mockResolvedValue({ stdout: JSON.stringify([raw]), stderr: '' });

    const { agents } = await listActiveSessions();

    // Not `toMatchObject`: the whole entry must be identical, because a field
    // dropped here is a field no later change can get back.
    expect(agents).toEqual([raw]);
  });

  it('names each session with the row the session list would show', async () => {
    mockExec.mockResolvedValue({ stdout: JSON.stringify([agent()]), stderr: '' });
    mockGetSessionEntry.mockResolvedValue(entry());

    const { entries } = await listActiveSessions();

    expect(mockGetSessionEntry).toHaveBeenCalledWith(
      '/Users/me/proj',
      '458fa4b4-a049-48e7-b61b-43bf2f2d029e',
    );
    expect(entries['458fa4b4-a049-48e7-b61b-43bf2f2d029e']?.title).toBe('fix the thing');
  });

  it('reads each session in ITS OWN directory, not the caller\'s', async () => {
    // The list is machine-wide, so a row can belong to a project the composer
    // knows nothing about. Looking it up under the caller's cwd would miss.
    mockExec.mockResolvedValue({
      stdout: JSON.stringify([agent({ cwd: '/Users/me/other', sessionId: 'other-id' })]),
      stderr: '',
    });

    await listActiveSessions('/Users/me/proj');

    expect(mockGetSessionEntry).toHaveBeenCalledWith('/Users/me/other', 'other-id');
  });

  it('keeps a session whose transcript could not be read', async () => {
    mockExec.mockResolvedValue({ stdout: JSON.stringify([agent()]), stderr: '' });
    mockGetSessionEntry.mockResolvedValue(null);

    const { agents, entries } = await listActiveSessions();

    // Still a real, reachable session — it just has no title of its own.
    expect(agents).toHaveLength(1);
    expect(entries).toEqual({});
  });

  it('keeps the session doing the asking, for the webview to drop', async () => {
    mockExec.mockResolvedValue({
      stdout: JSON.stringify([agent(), agent({ sessionId: 'b', name: 'proj-51', pid: 1 })]),
      stderr: '',
    });

    const { agents } = await listActiveSessions();

    expect(agents).toHaveLength(2);
  });

  it('survives text printed around the JSON', async () => {
    mockExec.mockResolvedValue({
      stdout: `warning: something\n${JSON.stringify([agent()])}\n`,
      stderr: '',
    });

    const { agents } = await listActiveSessions();

    expect(agents).toHaveLength(1);
  });

  it('returns an empty list when the CLI prints no array at all', async () => {
    mockExec.mockResolvedValue({ stdout: 'command not found', stderr: '' });

    const { agents, entries } = await listActiveSessions();

    expect(agents).toEqual([]);
    expect(entries).toEqual({});
  });

  it('skips an entry with no sessionId rather than looking one up', async () => {
    mockExec.mockResolvedValue({
      stdout: JSON.stringify([{ pid: 1, name: 'x', cwd: '/p' }]),
      stderr: '',
    });

    const { agents } = await listActiveSessions();

    expect(agents).toHaveLength(1);
    expect(mockGetSessionEntry).not.toHaveBeenCalled();
  });
});
