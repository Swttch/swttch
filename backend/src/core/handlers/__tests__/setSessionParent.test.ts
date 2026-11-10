import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  run: vi.fn(),
  entry: vi.fn(),
  version: vi.fn(),
}));

vi.mock('../../run-launcher', () => ({ runLauncher: mocks.run }));
vi.mock('../../session-mcp', () => ({
  getSessionMcpVersion: mocks.version,
  resolveSessionMcpEntry: mocks.entry,
  resetSessionMcpCache: vi.fn(),
}));
vi.mock('../../extend-kit-update', () => ({
  autoUpdateSessionMcp: vi.fn(),
  waitForSessionMcpStartupUpdate: vi.fn(),
}));
vi.mock('../getCliUpdateInfo', () => ({ fetchDistTags: vi.fn(), resolveClaudePaths: vi.fn() }));
vi.mock('../updateCli', () => ({ isPermissionFailure: vi.fn(), permissionErrorMessage: vi.fn() }));

import { setSessionArchivedHandler, setSessionParentHandler } from '../sessionMcp';
import { MessageType } from '../../../shared';

/**
 * Putting a session under another by hand. The record belongs to the session-management MCP, so
 * the edit is made by that package's own `set-parent` command; this backend only runs it.
 */
describe('setSessionParentHandler', () => {
  const sendTo = vi.fn();
  const broadcastToAll = vi.fn();
  const connections = { sendTo, broadcastToAll } as never;
  const message = (payload: unknown) => ({ requestId: 'r1', type: MessageType.SET_SESSION_PARENT, payload }) as never;
  const ackOf = () => sendTo.mock.calls[0][2];

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.entry.mockResolvedValue('/g/node_modules/@swttch/session-manager-mcp/src/cli.js');
    mocks.version.mockResolvedValue('0.4.0');
  });

  it('runs the package command with the session and the new parent, then tells every list to refresh', async () => {
    mocks.run.mockResolvedValue({ ok: true, output: '', stderr: '', stdout: '{"ok":true,"changed":true}\n' });

    await setSessionParentHandler('c1', message({ sessionId: 'child', parentSessionId: 'parent' }), connections, {} as never);

    expect(mocks.run).toHaveBeenCalledWith(
      process.execPath,
      ['/g/node_modules/@swttch/session-manager-mcp/src/cli.js', 'set-parent', 'child', 'parent'],
      expect.anything(),
    );
    expect(ackOf()).toMatchObject({ requestId: 'r1', status: 'ok', changed: true });
    expect(broadcastToAll).toHaveBeenCalledWith(MessageType.SESSIONS_UPDATED, { action: 'refresh' });
  });

  it('takes the session to the top level when no parent is given', async () => {
    mocks.run.mockResolvedValue({ ok: true, output: '', stderr: '', stdout: '{"ok":true,"changed":true}\n' });

    await setSessionParentHandler('c1', message({ sessionId: 'child', parentSessionId: null }), connections, {} as never);

    expect(mocks.run.mock.calls[0][1].slice(-2)).toEqual(['child', 'none']);
  });

  it('forgets what was chosen by hand when asked to inherit, so the desktop app\'s record shows again', async () => {
    mocks.run.mockResolvedValue({ ok: true, output: '', stderr: '', stdout: '{"ok":true,"changed":true}\n' });

    await setSessionParentHandler('c1', message({ sessionId: 'child', parentSessionId: null, inherit: true }), connections, {} as never);

    expect(mocks.run.mock.calls[0][1].slice(-2)).toEqual(['child', 'inherit']);
  });

  it('puts a session under another with a package that has only the first version of the command (0.3.0)', async () => {
    mocks.version.mockResolvedValue('0.3.0');
    mocks.run.mockResolvedValue({ ok: true, output: '', stderr: '', stdout: '{"ok":true,"changed":true}\n' });

    await setSessionParentHandler('c1', message({ sessionId: 'child', parentSessionId: 'parent' }), connections, {} as never);

    expect(ackOf().status).toBe('ok');
    expect(mocks.run).toHaveBeenCalled();
  });

  it('hands the package refusal back as it was written, and refreshes nothing', async () => {
    mocks.run.mockResolvedValue({
      ok: false,
      output: '',
      stderr: '',
      stdout: '{"ok":false,"error":"A session cannot be its own parent."}\n',
    });

    await setSessionParentHandler('c1', message({ sessionId: 'a', parentSessionId: 'a' }), connections, {} as never);

    expect(ackOf()).toMatchObject({ status: 'error', error: 'A session cannot be its own parent.' });
    expect(broadcastToAll).not.toHaveBeenCalled();
  });

  it('says so, and runs nothing, while the package is not installed', async () => {
    mocks.entry.mockResolvedValue(null);
    mocks.version.mockResolvedValue(null);

    await setSessionParentHandler('c1', message({ sessionId: 'a', parentSessionId: 'b' }), connections, {} as never);

    expect(mocks.run).not.toHaveBeenCalled();
    expect(ackOf().status).toBe('error');
  });

  it('says to update, and runs nothing, for a package that predates the command', async () => {
    mocks.version.mockResolvedValue('0.2.0');

    await setSessionParentHandler('c1', message({ sessionId: 'a', parentSessionId: 'b' }), connections, {} as never);

    expect(mocks.run).not.toHaveBeenCalled();
    expect(ackOf().error).toMatch(/0\.3\.0/);
  });

  it('refuses a request with no session', async () => {
    await setSessionParentHandler('c1', message({ parentSessionId: 'b' }), connections, {} as never);

    expect(mocks.run).not.toHaveBeenCalled();
    expect(ackOf().status).toBe('error');
  });
});

/** Archiving a session by hand: the same arrangement as the parent, with the package's `set-archived` command. */
describe('setSessionArchivedHandler', () => {
  const sendTo = vi.fn();
  const broadcastToAll = vi.fn();
  const connections = { sendTo, broadcastToAll } as never;
  const message = (payload: unknown) => ({ requestId: 'r1', type: MessageType.SET_SESSION_ARCHIVED, payload }) as never;
  const ackOf = () => sendTo.mock.calls[0][2];
  const lastArgs = () => mocks.run.mock.calls[0][1].slice(-3);

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.entry.mockResolvedValue('/g/node_modules/@swttch/session-manager-mcp/src/cli.js');
    mocks.version.mockResolvedValue('0.4.0');
    mocks.run.mockResolvedValue({ ok: true, output: '', stderr: '', stdout: '{"ok":true,"changed":true}\n' });
  });

  it('archives a session and tells every list to refresh', async () => {
    await setSessionArchivedHandler('c1', message({ sessionId: 's', archived: true }), connections, {} as never);

    expect(lastArgs()).toEqual(['set-archived', 's', 'archived']);
    expect(ackOf()).toMatchObject({ status: 'ok', changed: true });
    expect(broadcastToAll).toHaveBeenCalledWith(MessageType.SESSIONS_UPDATED, { action: 'refresh' });
  });

  it('brings a session back, or forgets what was chosen when asked to inherit', async () => {
    await setSessionArchivedHandler('c1', message({ sessionId: 's', archived: false }), connections, {} as never);
    expect(lastArgs()).toEqual(['set-archived', 's', 'unarchived']);

    mocks.run.mockClear();
    await setSessionArchivedHandler('c1', message({ sessionId: 's', inherit: true }), connections, {} as never);
    expect(lastArgs()).toEqual(['set-archived', 's', 'inherit']);
  });

  it('says to update, and runs nothing, for a package that predates the command', async () => {
    mocks.version.mockResolvedValue('0.3.0');

    await setSessionArchivedHandler('c1', message({ sessionId: 's', archived: true }), connections, {} as never);

    expect(mocks.run).not.toHaveBeenCalled();
    expect(ackOf().error).toMatch(/0\.4\.0/);
  });

  it('refuses a request with no session, or with neither archived nor inherit', async () => {
    await setSessionArchivedHandler('c1', message({ archived: true }), connections, {} as never);
    await setSessionArchivedHandler('c1', message({ sessionId: 's' }), connections, {} as never);

    expect(mocks.run).not.toHaveBeenCalled();
    expect(sendTo.mock.calls.every((c) => c[2].status === 'error')).toBe(true);
  });
});
