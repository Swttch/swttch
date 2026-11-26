import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { EventEmitter } from 'events';
import { existsSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { PassThrough } from 'stream';
import type { ChildProcess } from 'child_process';
import { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import { ensureClaudeProcess } from '../claude-process';
import { Claude } from '../claude';

vi.mock('../cli-auto-update', () => ({ triggerCliAutoUpdate: vi.fn() }));

// The session MCP config is a file written for one CLI. It has to be there while that CLI runs
// and gone afterwards, or the data folder grows by a file for every session ever opened.

let home: string;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'ccg-session-mcp-'));
  vi.stubEnv('CCG_HOME', home);
  vi.stubEnv('SWTTCH_SESSION_MCP_BIN', '/opt/swttch/session-mcp/src/cli.js');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  rmSync(home, { recursive: true, force: true });
});

function fakeCli() {
  return Object.assign(new EventEmitter(), {
    stdin: new PassThrough(),
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
    pid: undefined,
    exitCode: null,
    signalCode: null,
  });
}

/** Hands out these CLIs one per spawn, each reporting itself started. */
function spawnInTurn(...clis: ReturnType<typeof fakeCli>[]) {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  return vi.spyOn(Claude, 'spawnAuthed').mockImplementation(async () => {
    const cli = clis.shift()!;
    setImmediate(() => cli.emit('spawn'));
    return cli as unknown as ChildProcess;
  });
}

const start = (connections: ConnectionManager, sessionId: string) =>
  ensureClaudeProcess(connections, 'tab', home, sessionId, undefined, {} as Bridge);

it('keeps the config while the CLI runs and removes it when the CLI exits', async () => {
  const cli = fakeCli();
  const spawn = spawnInTurn(cli);

  await start(new ConnectionManager(true), 'sess-lifetime');

  const file = join(home, 'mcp', 'sess-lifetime.json');
  expect(spawn.mock.calls[0][0].slice(-2)).toEqual(['--mcp-config', file]);
  expect(existsSync(file)).toBe(true);

  cli.emit('close', 0);

  expect(existsSync(file)).toBe(false);
});

// A restart does not wait for 'close' when the old process has already exited, so the old CLI's
// 'close' can arrive after its replacement was handed the same path.
it('leaves the file alone when an older CLI of the session closes late', async () => {
  const older = fakeCli();
  const newer = fakeCli();
  spawnInTurn(older, newer);
  const connections = new ConnectionManager(true);
  const file = join(home, 'mcp', 'sess-restart.json');

  await start(connections, 'sess-restart');
  connections.setProcess('sess-restart', null);
  await start(connections, 'sess-restart');
  older.emit('close', 0);

  expect(existsSync(file)).toBe(true);

  newer.emit('close', 0);

  expect(existsSync(file)).toBe(false);
});
