#!/usr/bin/env node
/**
 * Orphaned-CLI hard-binding verification: scripted, NO token burn.
 *
 * Drives the BUILT backend (backend/dist/backend.mjs) with a fake `claude` binary
 * (bash fixture that never exits on stdin EOF — the worst-case mid-turn CLI) under
 * an isolated $HOME, on a scratch port (19837, NOT the real 19836), and asserts:
 *
 *   1. spawn shape: the chat CLI runs detached — pgid == pid (own process group);
 *   2. double-start: a second backend reclaims the port with
 *      SIGTERM first → the stale backend's shutdownAll() kills the whole CLI
 *      tree (fake CLI + its background child) — NO orphan;
 *   3. SIGHUP: terminal-close signal on the backend still takes
 *      the CLI tree down, now via the explicit SIGHUP handler (mandatory since
 *      process-group isolation detached the CLI from the terminal's group);
 *   4. residual gap (documented, not fixed here): SIGKILL of the backend
 *      still orphans the CLI — recorded honestly for the issue write-up.
 *
 * Usage: node backend/test-harness/cli-process-tree.verify.mjs
 * Artifacts (backend logs, fake-CLI log) land in $TMPDIR/cli-process-tree-verify/.
 */
import { spawn } from 'child_process';
import { mkdirSync, writeFileSync, readFileSync, chmodSync, rmSync } from 'fs';
import { join } from 'path';
import os from 'os';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const require = createRequire(new URL('../package.json', import.meta.url));
const WebSocket = require('ws');

const PORT = Number(process.env.CLI_TREE_PORT ?? 19837);
const ROOT = join(process.env.TMPDIR || os.tmpdir(), 'cli-process-tree-verify');
const HOME = join(ROOT, 'home');
const PROJ = join(ROOT, 'proj');
const CLI_LOG = join(ROOT, 'fake-cli.log');
const BACKEND = fileURLToPath(new URL('../dist/backend.mjs', import.meta.url));

const results = [];
let failed = false;

function report(name, ok, detail = '') {
  results.push({ name, ok, detail });
  if (!ok) failed = true;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitUntil(cond, timeoutMs, what) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await cond()) return true;
    await delay(100);
  }
  throw new Error(`timeout waiting for: ${what}`);
}

// ── Fixture setup ────────────────────────────────────────────────────────────

function setupFixtures() {
  rmSync(ROOT, { recursive: true, force: true });
  mkdirSync(join(HOME, '.claude-code-gui'), { recursive: true });
  mkdirSync(join(ROOT, 'bin'), { recursive: true });
  mkdirSync(PROJ, { recursive: true });

  const fakeCli = join(ROOT, 'bin', 'claude');
  // Worst-case CLI: ignores stdin EOF entirely, keeps a background child (the
  // stand-in for subagent shells / background tasks), exits cleanly on SIGTERM.
  writeFileSync(fakeCli, `#!/bin/bash
log="\${FAKE_CLI_LOG:?}"
pgid=$(ps -o pgid= -p $$ | tr -d ' ')
echo "started pid=$$ pgid=$pgid ppid=$PPID" >> "$log"
sleep 600 &
child=$!
echo "child pid=$$ childpid=$child" >> "$log"
trap 'echo "SIGTERM pid=$$" >> "$log"; kill $child 2>/dev/null; exit 0' TERM
trap 'echo "SIGHUP pid=$$" >> "$log"' HUP
while true; do sleep 1; done
`);
  chmodSync(fakeCli, 0o755);

  writeFileSync(
    join(HOME, '.claude-code-gui', 'settings.js'),
    `export default {\n  cliPath: ${JSON.stringify(fakeCli)},\n};\n`,
  );
}

// ── Backend + ws driving ─────────────────────────────────────────────────────

const backends = [];

function startBackend(label) {
  const proc = spawn(process.execPath, [BACKEND], {
    env: {
      ...process.env,
      HOME,
      PORT: String(PORT),
      FAKE_CLI_LOG: CLI_LOG,
      JETBRAINS_MODE: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const record = { label, proc, stdout: '', stderr: '', exited: false };
  proc.stdout.on('data', (d) => (record.stdout += d.toString()));
  proc.stderr.on('data', (d) => (record.stderr += d.toString()));
  proc.on('exit', () => (record.exited = true));
  backends.push(record);
  return record;
}

async function waitForPortLine(backend) {
  await waitUntil(() => backend.stdout.includes(`PORT:${PORT}`), 15_000, `${backend.label} PORT line`);
}

/** Connect to /ws and SEND_MESSAGE; resolves with the open socket after ACK. */
function driveSession(sessionId) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
    const timer = setTimeout(() => reject(new Error('ws drive timeout')), 10_000);
    ws.on('open', () => {
      ws.send(
        JSON.stringify({
          type: 'SEND_MESSAGE',
          requestId: `harness-${sessionId}`,
          timestamp: Date.now(),
          payload: {
            content: 'lifecycle probe',
            workingDir: PROJ,
            sessionId,
            isNewSession: true,
            inputMode: 'text',
          },
        }),
      );
    });
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'ACK' || msg.type === 'STREAM_START') {
        clearTimeout(timer);
        resolve(ws);
      }
    });
    ws.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

/** n-th (0-based) fake-CLI instance recorded in the log: { pid, pgid, child }. */
function cliFromLog(index) {
  const lines = readFileSync(CLI_LOG, 'utf8').trim().split('\n');
  const started = lines.filter((l) => l.startsWith('started'))[index];
  if (!started) return null;
  const pid = Number(/pid=(\d+)/.exec(started)[1]);
  const pgid = Number(/pgid=(\d+)/.exec(started)[1]);
  const childLine = lines.filter((l) => l.startsWith(`child pid=${pid}`)).pop();
  if (!childLine) return null; // start recorded, child not yet — treat as incomplete
  return { pid, pgid, child: Number(/childpid=(\d+)/.exec(childLine)[1]) };
}

/** Wait until the n-th fake CLI has fully registered (started + child lines). */
async function waitForCli(index, what) {
  await waitUntil(() => {
    try {
      return cliFromLog(index) !== null;
    } catch {
      return false;
    }
  }, 10_000, what);
  return cliFromLog(index);
}

// ── Scenarios ────────────────────────────────────────────────────────────────

async function main() {
  setupFixtures();

  // Scenario 1: spawn shape — detached chat CLI leads its own process group.
  const a = startBackend('backend-A');
  await waitForPortLine(a);
  const wsA = await driveSession('harness-session-1');
  const cliA = await waitForCli(0, 'fake CLI started under backend-A');
  report('S1 fake CLI spawned', pidAlive(cliA.pid) && pidAlive(cliA.child));
  report('S1 CLI is a process-group leader (pgid == pid)', cliA.pgid === cliA.pid,
    `pid=${cliA.pid} pgid=${cliA.pgid}`);

  // Scenario 2: double-start on the same port.
  const b = startBackend('backend-B');
  await waitForPortLine(b);
  await waitUntil(() => a.exited, 10_000, 'backend-A exit after SIGTERM reclaim');
  await waitUntil(() => !pidAlive(cliA.pid) && !pidAlive(cliA.child), 10_000, 'CLI tree of A dead');
  report('S2 second backend reclaimed the port gracefully',
    b.stderr.includes('already in use') && a.stderr.includes('SIGTERM received'));
  report('S2 stale backend CLI tree died with it (no orphan)',
    !pidAlive(cliA.pid) && !pidAlive(cliA.child));
  report('S2 fake CLI observed SIGTERM (graceful, not SIGKILL)',
    readFileSync(CLI_LOG, 'utf8').includes(`SIGTERM pid=${cliA.pid}`));
  try {
    wsA.terminate();
  } catch {
    // Socket already died with backend-A
  }

  // Scenario 3: SIGHUP on the backend (terminal close analog).
  const wsB = await driveSession('harness-session-2');
  const cliB = await waitForCli(1, 'fake CLI started under backend-B');
  report('S3 fake CLI spawned under backend-B', pidAlive(cliB.pid) && pidAlive(cliB.child));
  process.kill(b.proc.pid, 'SIGHUP');
  await waitUntil(() => b.exited, 10_000, 'backend-B exit on SIGHUP');
  await waitUntil(() => !pidAlive(cliB.pid) && !pidAlive(cliB.child), 10_000, 'CLI tree of B dead');
  report('S3 SIGHUP handler shut the backend down', b.stderr.includes('SIGHUP received'));
  report('S3 CLI tree died on SIGHUP (no orphan)', !pidAlive(cliB.pid) && !pidAlive(cliB.child));
  try {
    wsB.terminate();
  } catch {
    // Socket already died with backend-B
  }

  // Scenario 4: residual gap — SIGKILL of the backend still orphans the CLI.
  const c = startBackend('backend-C');
  await waitForPortLine(c);
  const wsC = await driveSession('harness-session-3');
  const cliC = await waitForCli(2, 'fake CLI started under backend-C');
  report('S4 fake CLI spawned under backend-C', pidAlive(cliC.pid) && pidAlive(cliC.child));
  process.kill(c.proc.pid, 'SIGKILL');
  await waitUntil(() => c.exited, 5_000, 'backend-C SIGKILLed');
  await delay(1_500);
  report('S4 residual gap confirmed: SIGKILL of backend orphans the CLI (pid-registry territory)',
    pidAlive(cliC.pid) && pidAlive(cliC.child));
  try {
    wsC.terminate();
  } catch {
    // Socket died with backend-C
  }
  // Manual cleanup of the intentional orphan.
  try {
    process.kill(-cliC.pid, 'SIGKILL');
  } catch {
    // Already gone
  }

  console.log('\nArtifacts in', ROOT);
  console.log(failed ? 'RESULT: FAIL' : 'RESULT: ALL PASS');
  process.exitCode = failed ? 1 : 0;
}

main()
  .catch((err) => {
    console.error('VERIFY ERROR:', err);
    process.exitCode = 2;
  })
  .finally(() => {
    for (const backend of backends) {
      if (!backend.exited) {
        try {
          backend.proc.kill('SIGKILL');
        } catch {
          // Already gone
        }
      }
    }
    try {
      for (let i = 0; ; i++) {
        const cli = cliFromLog(i);
        if (!cli) break;
        try {
          process.kill(-cli.pid, 'SIGKILL');
        } catch {
          // Already gone
        }
      }
    } catch {
      // No CLI ever started
    }
  });
