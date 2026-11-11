import { beforeEach, describe, expect, it, vi } from 'vitest';

// This backend never opens the Claude desktop app's files: the session-management package does, and these
// tests say what the package's commands print (or that the package is missing or too old).
const pkg = vi.hoisted(() => ({
  entry: '/pkg/src/cli.js' as string | null,
  version: '0.5.0' as string | null,
  stdout: '',
  calls: [] as string[][],
}));

vi.mock('../../session-mcp', () => ({
  resolveSessionMcpEntry: vi.fn(async () => pkg.entry),
  getSessionMcpVersion: vi.fn(async () => pkg.version),
}));
vi.mock('../../run-launcher', () => ({
  runLauncher: vi.fn(async (_command: string, args: string[]) => {
    pkg.calls.push(args);
    return { ok: true, output: pkg.stdout, stdout: pkg.stdout, stderr: '' };
  }),
}));

import { EMPTY_DESKTOP_STATE, findDesktopSession, findStarter, parseDesktopState, readDesktopState } from '../desktopSessions';

describe('the desktop app\'s records, through the package', () => {
  beforeEach(() => {
    pkg.entry = '/pkg/src/cli.js';
    pkg.version = '0.5.0';
    pkg.stdout = '';
    pkg.calls.length = 0;
  });

  it('turns the package\'s desktop-state answer into maps and sets', () => {
    const state = parseDesktopState({ ok: true, starters: { b: 'a' }, archived: ['a'], titles: { a: 'Boss' }, running: ['b'] });
    expect([...state.starters]).toEqual([['b', 'a']]);
    expect([...state.archived]).toEqual(['a']);
    expect([...state.titles]).toEqual([['a', 'Boss']]);
    expect([...state.running]).toEqual(['b']);
  });

  it('ignores what is not of the shape the package promises', () => {
    const state = parseDesktopState({ ok: true, starters: { b: 7 }, archived: 'a', titles: null, running: [1, 'x'] });
    expect(state.starters.size).toBe(0);
    expect(state.archived.size).toBe(0);
    expect(state.titles.size).toBe(0);
    expect([...state.running]).toEqual(['x']);
  });

  it('reads the state by running the package\'s desktop-state command', async () => {
    pkg.stdout = JSON.stringify({ ok: true, starters: { b: 'a' }, archived: [], titles: {}, running: [] }) + '\n';
    expect([...(await readDesktopState()).starters]).toEqual([['b', 'a']]);
    expect(pkg.calls).toEqual([['/pkg/src/cli.js', 'desktop-state']]);
  });

  it('answers nothing, and runs nothing, when the package is not installed or is older than the commands', async () => {
    pkg.entry = null;
    expect(await readDesktopState()).toBe(EMPTY_DESKTOP_STATE);
    pkg.entry = '/pkg/src/cli.js';
    pkg.version = '0.4.0';
    expect(await readDesktopState()).toBe(EMPTY_DESKTOP_STATE);
    expect(await findStarter('x')).toBeUndefined();
    expect(await findDesktopSession('local_x')).toBeUndefined();
    expect(pkg.calls).toEqual([]);
  });

  it('answers nothing when the command printed something that is not an answer', async () => {
    pkg.stdout = 'Error: boom\n';
    expect(await readDesktopState()).toBe(EMPTY_DESKTOP_STATE);
    pkg.stdout = JSON.stringify({ ok: false, error: 'no' }) + '\n';
    expect(await findStarter('x')).toBeUndefined();
  });

  it('names who started a session and the folder that one works in', async () => {
    pkg.stdout = JSON.stringify({ ok: true, startedBy: 'boss', source: 'desktop', cwd: '/work/app' }) + '\n';
    expect(await findStarter('child')).toEqual({ sessionId: 'boss', cwd: '/work/app' });
    expect(pkg.calls).toEqual([['/pkg/src/cli.js', 'started-by', 'child']]);
    pkg.stdout = JSON.stringify({ ok: true, startedBy: null, source: null, cwd: null }) + '\n';
    expect(await findStarter('child')).toBeUndefined();
  });

  it('hands over one desktop session\'s record, or nothing when the package knows of none', async () => {
    pkg.stdout = JSON.stringify({ ok: true, session: { title: 'Boss', cliSessionId: 'cli-1', isArchived: false } }) + '\n';
    expect(await findDesktopSession('local_a')).toEqual({ title: 'Boss', cliSessionId: 'cli-1', isArchived: false });
    pkg.stdout = JSON.stringify({ ok: true, session: null }) + '\n';
    expect(await findDesktopSession('local_none')).toBeUndefined();
  });
});
