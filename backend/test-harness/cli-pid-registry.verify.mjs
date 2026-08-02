#!/usr/bin/env node
/**
 * Pid-registry verification: startup orphan sweep and the
 * pre-`--resume` liveness guard. Scripted, NO token burn — same fake-CLI
 * approach as cli-process-tree.verify.mjs (worst-case CLI ignoring stdin EOF), isolated
 * $HOME, scratch ports 19838/19839 (never the real 19836).
 *
 * Scenarios:
 *   S1 startup sweep — SIGKILL a backend with a live CLI (the SIGKILL residual
 *      gap), start a fresh backend on the same port: its startup sweep must
 *      find the orphan via the registry and kill the whole tree.
 *   S2 resume guard (orphan) — plant a live orphan registered for a session,
 *      then send a prompt for that session: the backend must kill the orphan
 *      BEFORE spawning its own CLI (no dual writer on one JSONL).
 *   S3 resume guard (live owner) — the same session driven through a SECOND
 *      backend on another port must be REFUSED (SERVICE_ERROR), and the first
 *      backend's CLI must stay untouched.
 *
 * Usage: node backend/test-harness/cli-pid-registry.verify.mjs
 * Artifacts land in $TMPDIR/cli-pid-registry-verify/.
 */
import { spawn } from 'child_process';
import { mkdirSync, writeFileSync, readFileSync, readdirSync, chmodSync, rmSync } from 'fs';
import { join } from 'path';
import os from 'os';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const require = createRequire(new URL('../package.json', import.meta.url));
const WebSocket = require('ws');

const PORT_A = Number(process.env.PID_REGISTRY_PORT ?? 19838);
const PORT_B = PORT_A + 1;
const ROOT = join(process.env.TMPDIR || os.tmpdir(), 'cli-pid-registry-verify');
const HOME = join(ROOT, 'home');
const PROJ = join(ROOT, 'proj');
const CLI_LOG = join(ROOT, 'fake-cli.log');
const REGISTRY = join(HOME, '.claude-code-gui', 'cli-registry');
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

// ── Fixtures (same fake CLI as cli-process-tree.verify) ──────────────────────────────────

function setupFixtures() {
  rmSync(ROOT, { recursive: true, force: true });
  mkdirSync(join(HOME, '.claude-code-gui'), { recursive: true });
  mkdirSync(join(ROOT, 'bin'), { recursive: true });
  mkdirSync(PROJ, { recursive: true });

  const fakeCli = join(ROOT, 'bin', 'claude');
  writeFileSync(fakeCli, `#!/bin/bash
log="\${FAKE_CLI_LOG:?}"
pgid=$(ps -o pgid= -p $$ | tr -d ' ')
echo "started pid=$$ pgid=$pgid args=$*" >> "$log"
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

function startBackend(label, port) {
  const proc = spawn(process.execPath, [BACKEND], {
    env: { ...process.env, HOME, PORT: String(port), FAKE_CLI_LOG: CLI_LOG, JETBRAINS_MODE: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const record = { label, port, proc, stdout: '', stderr: '', exited: false };
  proc.stdout.on('data', (d) => (record.stdout += d.toString()));
  proc.stderr.on('data', (d) => (record.stderr += d.toString()));
  proc.on('exit', () => (record.exited = true));
  backends.push(record);
  return record;
}

async function waitForPortLine(backend) {
  await waitUntil(
    () => backend.stdout.includes(`PORT:${backend.port}`),
    15_000,
    `${backend.label} PORT line`,
  );
}

/** Connect, SEND_MESSAGE, collect pushed messages; resolve on ACK. */
function drive(port, sessionId) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const messages = [];
    const timer = setTimeout(() => reject(new Error(`ws drive timeout (session ${sessionId})`)), 15_000);
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
      messages.push(msg);
      if (msg.type === 'ACK') {
        clearTimeout(timer);
        resolve({ ws, messages });
      }
    });
    ws.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

/** n-th (0-based) fake-CLI instance recorded in the log. */
function cliFromLog(index) {
  let content;
  try {
    content = readFileSync(CLI_LOG, 'utf8');
  } catch {
    return null;
  }
  const lines = content.trim().split('\n');
  const started = lines.filter((l) => l.startsWith('started'))[index];
  if (!started) return null;
  const pid = Number(/pid=(\d+)/.exec(started)[1]);
  const childLine = lines.filter((l) => l.startsWith(`child pid=${pid}`)).pop();
  if (!childLine) return null;
  return { pid, child: Number(/childpid=(\d+)/.exec(childLine)[1]) };
}

async function waitForCli(index, what) {
  await waitUntil(() => cliFromLog(index) !== null, 10_000, what);
  return cliFromLog(index);
}

/** A dead-but-real pid for crafting orphan entries. */
function deadPid() {
  return new Promise((resolve, reject) => {
    const proc = spawn('true');
    proc.on('error', reject);
    proc.on('exit', () => resolve(proc.pid));
  });
}

/**
 * Plant a fake orphan: a live marked process + a registry entry with a dead
 * owner, exactly what a hard-killed backend leaves behind. The marker script is
 * multi-command so `sh -c` does not exec-optimize the marker out of its argv.
 */
async function plantOrphan(sessionId) {
  const proc = spawn('sh', ['-c', 'sleep 600; true', sessionId], {
    detached: true,
    stdio: 'ignore',
  });
  await waitUntil(() => proc.pid !== undefined, 5_000, 'orphan spawn');
  mkdirSync(REGISTRY, { recursive: true });
  writeFileSync(
    join(REGISTRY, `${proc.pid}.json`),
    JSON.stringify({
      pid: proc.pid,
      sessionId,
      workingDir: PROJ,
      startedAt: new Date().toISOString(),
      owner: { pid: await deadPid(), argv1: 'backend.mjs' },
    }),
  );
  return proc;
}

// ── Scenarios ────────────────────────────────────────────────────────────────

async function main() {
  setupFixtures();

  // S1: startup orphan sweep after a SIGKILLed backend (the SIGKILL residual gap).
  const a = startBackend('backend-A', PORT_A);
  await waitForPortLine(a);
  const driveA = await drive(PORT_A, 'harness-session-1');
  const cliA = await waitForCli(0, 'fake CLI under backend-A');
  process.kill(a.proc.pid, 'SIGKILL');
  await waitUntil(() => a.exited, 5_000, 'backend-A SIGKILLed');
  await delay(500);
  report('S1 orphan exists after backend SIGKILL', pidAlive(cliA.pid) && pidAlive(cliA.child));
  report('S1 registry entry survived the hard death',
    readdirSync(REGISTRY).includes(`${cliA.pid}.json`));

  const b = startBackend('backend-B', PORT_A);
  await waitForPortLine(b);
  await waitUntil(() => !pidAlive(cliA.pid) && !pidAlive(cliA.child), 10_000, 'S1 orphan killed by sweep');
  report('S1 startup sweep killed the orphan tree',
    !pidAlive(cliA.pid) && !pidAlive(cliA.child));
  report('S1 sweep logged its kill', b.stderr.includes('Orphan sweep: killing orphaned CLI'));
  try {
    driveA.ws.terminate();
  } catch {
    // Died with backend-A
  }

  // S2: resume guard — planted live orphan for the session must die BEFORE spawn.
  const orphan = await plantOrphan('harness-session-2');
  const driveB = await drive(PORT_A, 'harness-session-2');
  await waitUntil(() => !pidAlive(orphan.pid), 10_000, 'S2 orphan killed by resume guard');
  const cliB = await waitForCli(1, 'fake CLI spawned after the guard');
  report('S2 resume guard killed the live orphan first', !pidAlive(orphan.pid));
  report('S2 guard logged the kill', b.stderr.includes('Killing orphaned CLI'));
  report('S2 fresh CLI runs for the session afterwards', pidAlive(cliB.pid));
  report('S2 respawn switched to --resume (session already ran)',
    b.stderr.includes('--resume') && b.stderr.includes('harness-session-2'));

  // S3: resume guard — same session via a SECOND backend must be refused.
  const c = startBackend('backend-C', PORT_B);
  await waitForPortLine(c);
  const driveC = await drive(PORT_B, 'harness-session-2');
  const refusal = driveC.messages.find(
    (m) => m.type === 'SERVICE_ERROR' && String(m.payload?.reason ?? '').includes('already active under another backend'),
  );
  report('S3 second backend refused the takeover (SERVICE_ERROR)', Boolean(refusal));
  report('S3 first backend CLI untouched', pidAlive(cliB.pid) && pidAlive(cliB.child));
  report('S3 no second fake CLI was spawned', cliFromLog(2) === null);
  try {
    driveB.ws.terminate();
    driveC.ws.terminate();
  } catch {
    // Already closed
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
    for (let i = 0; ; i++) {
      const cli = cliFromLog(i);
      if (!cli) break;
      try {
        process.kill(-cli.pid, 'SIGKILL');
      } catch {
        // Already gone
      }
    }
  });
