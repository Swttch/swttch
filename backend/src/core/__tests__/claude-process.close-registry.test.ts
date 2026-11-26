import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { EventEmitter } from 'events';
import type { ChildProcess } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import { ensureClaudeProcess } from '../claude-process';
import { Claude } from '../claude';
import { unregisterCliProcess } from '../cli-registry';

// A CLI's registry entry is what a LATER backend reads to remove the MCP containers that CLI
// left behind. Dropping it as the CLI closes, while the reclaim is still running, loses that
// second chance whenever this backend leaves before the reclaim is done.

const reclaim = vi.hoisted(() => ({ finish: () => {} }));

vi.mock('../cli-auto-update', () => ({ triggerCliAutoUpdate: vi.fn() }));
vi.mock('../session-mcp', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../session-mcp')>()),
  resolveInstalledSessionMcp: vi.fn(async () => null),
}));
vi.mock('../cli-registry', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../cli-registry')>()),
  findLiveCliForSession: vi.fn(() => null),
  registerCliProcess: vi.fn(),
  unregisterCliProcess: vi.fn(),
}));
vi.mock('../mcp-container-reclaimer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../mcp-container-reclaimer')>()),
  whenMcpContainersReclaimed: vi.fn(
    () =>
      new Promise<void>((resolve) => {
        reclaim.finish = resolve;
      }),
  ),
}));

let workingDir: string;

beforeEach(() => {
  workingDir = mkdtempSync(join(tmpdir(), 'ccg-close-registry-'));
});

afterEach(() => {
  rmSync(workingDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function createFakeCli(): ChildProcess & EventEmitter {
  return Object.assign(new EventEmitter(), {
    pid: 999_999,
    exitCode: null,
    signalCode: null,
    stdin: Object.assign(new EventEmitter(), { writable: true, write: vi.fn() }),
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
    kill: vi.fn(),
  }) as unknown as ChildProcess & EventEmitter;
}

it('keeps the registry entry until the MCP containers of the closed CLI are reclaimed', async () => {
  const proc = createFakeCli();
  vi.spyOn(Claude, 'spawnAuthed').mockImplementation(async () => {
    setImmediate(() => proc.emit('spawn'));
    return proc;
  });
  const connections = new ConnectionManager(true);
  await ensureClaudeProcess(connections, 'tab', workingDir, 'session', undefined, {} as Bridge);

  proc.emit('close', null);
  await new Promise((resolve) => setImmediate(resolve));
  expect(unregisterCliProcess).not.toHaveBeenCalled();

  reclaim.finish();
  await new Promise((resolve) => setImmediate(resolve));
  expect(unregisterCliProcess).toHaveBeenCalledWith(proc.pid);
});
