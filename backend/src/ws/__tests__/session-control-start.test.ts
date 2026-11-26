import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConnectionManager } from '../connection-manager';
import { handleSessionControl } from '../session-control-route';
import { ensureClaudeProcess } from '../../core/claude-process';
import { renameSessionThroughCli } from '../../core/features/cli-rename';
import { recordTurnEnd, resetTurnEnds } from '../../core/features/turnEnds';
import type { Bridge } from '../../bridge/bridge-interface';

vi.mock('../../core/claude', () => ({ Claude: { killTree: vi.fn() } }));
vi.mock('../../core/features/cli-rename', () => ({
  normalizeSessionName: (title: string) => title.replace(/\s+/g, ' ').trim(),
  renameSessionThroughCli: vi.fn(async () => 'request_to_live_cli'),
}));
// The CLI itself is not run: what is asked is what the route hands to the part that runs it, and what it writes after.
vi.mock('../../core/claude-process', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../core/claude-process')>()),
  ensureClaudeProcess: vi.fn(),
}));

const body = (o: unknown) => JSON.stringify(o);
const bridge = {} as Bridge;
const ensure = vi.mocked(ensureClaudeProcess);
const rename = vi.mocked(renameSessionThroughCli);

const START = { action: 'start_session', sessionId: 'child', workingDir: '/work', text: 'The brief', title: 'Lyricist' };

// The session-management MCP asks this backend to run a new session when the session that started it is held here,
// because a CLI run here is given the channel through which it asks the person, and so has the question card.
describe('start_session through /internal/session-control', () => {
  let cm: ConnectionManager;
  let written: string[];

  beforeEach(() => {
    cm = new ConnectionManager();
    resetTurnEnds();
    ensure.mockReset();
    rename.mockClear();
    written = [];
    // What running the CLI leaves behind: a process of this session that takes what is written to it.
    ensure.mockImplementation(async (connections, _connectionId, workingDir, sessionId) => {
      connections.getOrCreateSession(sessionId, workingDir);
      connections.setProcess(sessionId, { stdin: { writable: true, write: (text: string) => { written.push(text); return true; } }, once: () => {} } as never);
    });
  });

  it('runs the CLI with no screen attached, in the folder asked for, and hands it the brief as its first message', async () => {
    const result = await handleSessionControl(cm, body(START), { bridge });

    expect(result).toEqual({ status: 200, body: { ok: true, turnEnds: 0 } });
    expect(ensure).toHaveBeenCalledWith(cm, '', '/work', 'child', undefined, bridge, undefined);
    const sent = written.flatMap((w) => w.split('\n').filter(Boolean)).map((l) => JSON.parse(l));
    expect(sent[0].type).toBe('user');
    expect(JSON.stringify(sent[0])).toContain('The brief');
  });

  it('names the session as asked, once it runs', async () => {
    await handleSessionControl(cm, body(START), { bridge });
    expect(rename).toHaveBeenCalledWith(cm, 'child', 'Lyricist', '/work');
  });

  it('does not fail the start because the name could not be written', async () => {
    rename.mockRejectedValueOnce(new Error('timed out'));
    expect((await handleSessionControl(cm, body(START), { bridge })).status).toBe(200);
  });

  it('carries the model, the effort and the permission mode the caller asked for', async () => {
    await handleSessionControl(cm, body({ ...START, model: 'sonnet', effort: 'high', permissionMode: 'acceptEdits' }), { bridge });
    expect(ensure).toHaveBeenCalledWith(cm, '', '/work', 'child', expect.any(String), bridge, 'sonnet');
    expect(cm.getSession('child')?.effortPick).toBe('high');
  });

  it('refuses a request that lacks the session, the folder or the brief, or names a mode the CLI does not have', async () => {
    for (const bad of [{ sessionId: '' }, { workingDir: '' }, { text: '' }, { permissionMode: 'anything-goes' }]) {
      expect((await handleSessionControl(cm, body({ ...START, ...bad }), { bridge })).status).toBe(400);
    }
    expect(ensure).not.toHaveBeenCalled();
  });

  it('refuses to run a session this backend already holds a process for, so a repeated request does not start it twice', async () => {
    cm.getOrCreateSession('child', '/work');
    cm.setProcess('child', { stdin: { writable: true, write: () => true }, once: () => {} } as never);
    expect((await handleSessionControl(cm, body(START), { bridge })).status).toBe(409);
    expect(ensure).not.toHaveBeenCalled();
  });

  it('answers with an error, so the caller can start the session itself, when the CLI did not start', async () => {
    ensure.mockImplementation(async () => undefined); // it reports the failure to the screens and leaves no process
    expect((await handleSessionControl(cm, body(START), { bridge })).status).toBe(500);
  });

  it('answers with an error when running the CLI throws', async () => {
    ensure.mockRejectedValue(new Error('spawn claude ENOENT'));
    const result = await handleSessionControl(cm, body(START), { bridge });
    expect(result.status).toBe(500);
    expect(result.body.error).toBe('spawn claude ENOENT');
  });
});

// A program asks what this route can do before it uses a newer action, because it must not try the action first and
// run the session itself when that fails: a request that timed out may have started the session all the same.
describe('capabilities through /internal/session-control', () => {
  it('lists the actions, among them the two that start a session and wait for its first turn', async () => {
    const result = await handleSessionControl(new ConnectionManager(), body({ action: 'capabilities' }));
    expect(result.status).toBe(200);
    expect(result.body.ok).toBe(true);
    expect(result.body.actions).toEqual(expect.arrayContaining(['start_session', 'await_turn_end', 'send_message', 'rename']));
  });

  it('needs no session, so it can be asked before the session exists', async () => {
    expect((await handleSessionControl(new ConnectionManager(), body({ action: 'capabilities' }))).status).toBe(200);
  });
});

// The first turn of a started session is what the session that started it is told about.
describe('await_turn_end through /internal/session-control', () => {
  let cm: ConnectionManager;
  beforeEach(() => {
    cm = new ConnectionManager();
    resetTurnEnds();
  });

  it('is answered when a turn of the session ends', async () => {
    const waiting = handleSessionControl(cm, body({ action: 'await_turn_end', sessionId: 'child', after: 0, waitMs: 10_000 }));
    recordTurnEnd('child');
    expect(await waiting).toEqual({ status: 200, body: { ok: true, ended: true, turnEnds: 1 } });
  });

  it('is answered at once when the turn ended before the request came', async () => {
    recordTurnEnd('child');
    const result = await handleSessionControl(cm, body({ action: 'await_turn_end', sessionId: 'child', after: 0, waitMs: 10_000 }));
    expect(result.body).toEqual({ ok: true, ended: true, turnEnds: 1 });
  });

  it('says that nothing ended when the wait time is up', async () => {
    const result = await handleSessionControl(cm, body({ action: 'await_turn_end', sessionId: 'child', after: 0, waitMs: 5 }));
    expect(result.body).toEqual({ ok: true, ended: false, turnEnds: 0 });
  });

  it('refuses a request that names no session', async () => {
    expect((await handleSessionControl(cm, body({ action: 'await_turn_end' }))).status).toBe(400);
  });
});
