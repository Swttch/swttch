import { describe, it, expect, afterEach } from 'vitest';
import { spawn, type ChildProcess } from 'child_process';
import { Claude } from '../claude';
import { ConnectionManager } from '../../ws/connection-manager';

// Real-process integration tests reproducing the orphaned-CLI bug.
// claude.test.ts mocks child_process entirely; the process-group kill semantics
// verified here are exactly what mocks cannot prove. POSIX-only: the win32 branch
// shells out to taskkill, which needs Windows (untested locally).

const isPosix = process.platform !== 'win32';

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitUntil(cond: () => boolean, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (cond()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('condition not met within timeout');
}

/** First stdout line of [proc] — the fixtures echo their grandchild PID there. */
function firstStdoutLine(proc: ChildProcess): Promise<string> {
  return new Promise((resolve, reject) => {
    let buf = '';
    proc.stdout?.on('data', (data: Buffer) => {
      buf += data.toString();
      const nl = buf.indexOf('\n');
      if (nl >= 0) resolve(buf.slice(0, nl).trim());
    });
    proc.on('error', reject);
    proc.on('exit', () => reject(new Error(`exited before printing a line: "${buf}"`)));
  });
}

/**
 * Spawn a fixture shaped like the chat CLI spawn (claude-process.ts): detached ⇒
 * own process group, with a background grandchild whose PID it echoes — the
 * stand-in for subagent shells / background tasks under a real CLI.
 */
function spawnDetachedTree(shellScript = 'sleep 30 & echo $!; wait'): ChildProcess {
  return spawn('sh', ['-c', shellScript], {
    detached: true,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
}

describe.skipIf(!isPosix)('Claude.killTree (POSIX, real processes)', () => {
  const spawned: ChildProcess[] = [];
  afterEach(() => {
    for (const proc of spawned) {
      if (proc.pid) {
        try {
          process.kill(-proc.pid, 'SIGKILL');
        } catch {
          // Not a group leader or already gone
        }
      }
      try {
        proc.kill('SIGKILL');
      } catch {
        // Already gone
      }
    }
    spawned.length = 0;
  });

  it('kills the whole tree of a detached child — grandchild included', async () => {
    const proc = spawnDetachedTree();
    spawned.push(proc);
    const grandchildPid = parseInt(await firstStdoutLine(proc), 10);
    expect(Number.isFinite(grandchildPid)).toBe(true);
    expect(pidAlive(grandchildPid)).toBe(true);

    Claude.killTree(proc);

    await waitUntil(() => proc.exitCode !== null || proc.signalCode !== null);
    await waitUntil(() => !pidAlive(grandchildPid));
  });

  it('falls back to a plain signal for a non-detached (non-leader) child', async () => {
    const proc = spawn('sleep', ['30'], { stdio: 'ignore' });
    spawned.push(proc);

    Claude.killTree(proc);

    await waitUntil(() => proc.exitCode !== null || proc.signalCode !== null);
    expect(proc.signalCode).toBe('SIGTERM');
  });
});

describe.skipIf(!isPosix)('ConnectionManager.shutdownAll', () => {
  it('kill-sweeps every registered session tree', async () => {
    const connections = new ConnectionManager();
    const procs = [
      spawn('sh', ['-c', 'sleep 30 & echo $!; wait'], {
        detached: true,
        stdio: ['ignore', 'pipe', 'ignore'],
      }),
      spawn('sh', ['-c', 'sleep 30 & echo $!; wait'], {
        detached: true,
        stdio: ['ignore', 'pipe', 'ignore'],
      }),
    ];
    try {
      const grandchildren = await Promise.all(
        procs.map(async (proc) => parseInt(await firstStdoutLine(proc), 10)),
      );
      connections.getOrCreateSession('session-a');
      connections.setProcess('session-a', procs[0]);
      connections.getOrCreateSession('session-b');
      connections.setProcess('session-b', procs[1]);

      connections.shutdownAll();

      await waitUntil(() => procs.every((p) => p.exitCode !== null || p.signalCode !== null));
      await waitUntil(() => grandchildren.every((pid) => !pidAlive(pid)));
    } finally {
      for (const proc of procs) {
        if (proc.pid) {
          try {
            process.kill(-proc.pid, 'SIGKILL');
          } catch {
            // Already gone
          }
        }
      }
    }
  });
});
