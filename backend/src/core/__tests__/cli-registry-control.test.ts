import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { spawn, type ChildProcess } from 'child_process';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

let fakeHome: string;
vi.mock('os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('os')>();
  return { ...actual, homedir: () => fakeHome };
});

import { registerCliProcess, unregisterCliProcess } from '../cli-registry';
import { setBackendEndpoint } from '../backend-endpoint';

const isPosix = process.platform !== 'win32';

describe('the CLI registry says how to reach the backend that holds a session', () => {
  let child: ChildProcess;
  beforeEach(() => {
    fakeHome = mkdtempSync(join(tmpdir(), 'ccg-regctl-'));
    child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30000)'], { stdio: 'ignore' });
  });
  afterEach(() => {
    unregisterCliProcess(child.pid);
    child.kill();
    setBackendEndpoint(undefined);
    rmSync(fakeHome, { recursive: true, force: true });
  });

  const file = () => join(fakeHome, '.claude-code-gui', 'cli-registry', `${child.pid}.json`);

  it('records the port and token once the backend knows them, readable by the user only', () => {
    setBackendEndpoint({ port: 4321, token: 'secret-token' });
    registerCliProcess(child, 'sess-1', '/work');
    const entry = JSON.parse(readFileSync(file(), 'utf8'));
    expect(entry.control).toEqual({ port: 4321, token: 'secret-token' });
    if (isPosix) expect(statSync(file()).mode & 0o777).toBe(0o600);
  });

  it('records no control block while the backend has not announced its port', () => {
    registerCliProcess(child, 'sess-1', '/work');
    expect(JSON.parse(readFileSync(file(), 'utf8')).control).toBeUndefined();
  });
});
