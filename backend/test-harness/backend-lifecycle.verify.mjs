#!/usr/bin/env node
/**
 * Backend keep-alive lifecycle verification: the gate (SET_KEEP_ALIVE over /rpc),
 * ppid watchdog (keep-alive clamp), prewarm-leak fix and the
 * GET /internal/status counters. Scripted, NO token burn — same fake-CLI
 * approach as the cli-*.verify.mjs harnesses, isolated $HOME per scenario, scratch ports
 * 19840+ (never the real 19836).
 *
 * The backend is spawned through a FAKE PARENT process (stand-in for the IDE
 * JVM) so scenarios can kill the parent and watch the watchdog react. All
 * scenarios run CONCURRENTLY — each one sits through the hardcoded 60 s idle
 * grace (plus the 10 s watchdog poll), so a sequential run would take ~7 min.
 *
 * Scenarios:
 *   S1 baseline — keep-alive OFF: /ws connect + disconnect → backend exits
 *      after the ~60 s idle grace (unchanged behavior).
 *   S2 gate — SET_KEEP_ALIVE(true) over /rpc, then /ws connect + disconnect →
 *      backend is still alive well past the grace.
 *   S3 clamp with client — keep-alive ON, SIGKILL the parent while a /ws
 *      client is attached → watchdog fires, backend stays up; after
 *      the client disconnects it exits within the grace.
 *   S4 clamp without clients — keep-alive ON, SIGKILL the parent with zero
 *      /ws clients → backend exits within watchdog poll + grace.
 *   S5 prewarm-leak fix — backend that never receives any /ws client, /rpc
 *      pushes SET_KEEP_ALIVE(false) (what Kotlin does on every connect) →
 *      backend exits after the grace instead of lingering forever.
 *   S6 status endpoint — GET /internal/status reflects the gate, the
 *      panel/browser connection breakdown and the streaming-session count.
 *
 * Usage: node backend/test-harness/backend-lifecycle.verify.mjs
 * Artifacts land in $TMPDIR/backend-lifecycle-verify/.
 */
import { spawn } from 'child_process';
import { mkdirSync, writeFileSync, chmodSync, rmSync } from 'fs';
import { join } from 'path';
import os from 'os';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const require = createRequire(new URL('../package.json', import.meta.url));
const WebSocket = require('ws');

const BASE_PORT = Number(process.env.LIFECYCLE_PORT ?? 19840);
const ROOT = join(process.env.TMPDIR || os.tmpdir(), 'backend-lifecycle-verify');
const BACKEND = fileURLToPath(new URL('../dist/backend.mjs', import.meta.url));

const IDLE_GRACE_MS = 60_000;
const WATCHDOG_POLL_MS = 10_000;
// "Exits after the grace" allowance: grace + watchdog poll + scheduling slack.
const EXIT_ALLOWANCE_MS = IDLE_GRACE_MS + WATCHDOG_POLL_MS + 15_000;
// "Still alive past the grace" probe point.
const SURVIVE_PROBE_MS = IDLE_GRACE_MS + 15_000;

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
    await delay(200);
  }
  throw new Error(`timeout waiting for: ${what}`);
}

// ── Per-scenario context ─────────────────────────────────────────────────────

const contexts = [];

/**
 * Isolated home + fake CLI + backend spawned under a killable fake parent
 * (the IDE JVM stand-in). Backend stdio is inherited from the parent, so its
 * PORT line and logs arrive on the parent's pipes and stay readable after the
 * parent dies (the backend keeps the fd open).
 */
async function startContext(name, port) {
  const root = join(ROOT, name);
  const home = join(root, 'home');
  rmSync(root, { recursive: true, force: true });
  mkdirSync(join(home, '.claude-code-gui'), { recursive: true });
  mkdirSync(join(root, 'bin'), { recursive: true });
  mkdirSync(join(root, 'proj'), { recursive: true });

  const fakeCli = join(root, 'bin', 'claude');
  writeFileSync(fakeCli, `#!/bin/bash
log="\${FAKE_CLI_LOG:?}"
echo "started pid=$$ args=$*" >> "$log"
trap 'echo "SIGTERM pid=$$" >> "$log"; exit 0' TERM
while true; do sleep 1; done
`);
  chmodSync(fakeCli, 0o755);
  writeFileSync(
    join(home, '.claude-code-gui', 'settings.js'),
    `export default {\n  cliPath: ${JSON.stringify(fakeCli)},\n};\n`,
  );

  const fakeParent = join(root, 'fake-parent.cjs');
  writeFileSync(fakeParent, `
const { spawn } = require('child_process');
const child = spawn(process.execPath, [process.argv[2]], { stdio: ['ignore', 'inherit', 'inherit'] });
console.log('BACKEND_PID:' + child.pid);
setInterval(() => {}, 1000); // stay alive until killed
`);

  const parent = spawn(process.execPath, [fakeParent, BACKEND], {
    env: {
      ...process.env,
      HOME: home,
      PORT: String(port),
      JETBRAINS_MODE: 'true',
      FAKE_CLI_LOG: join(root, 'fake-cli.log'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const ctx = { name, port, root, parent, out: '', err: '', backendPid: null };
  parent.stdout.on('data', (d) => (ctx.out += d.toString()));
  parent.stderr.on('data', (d) => (ctx.err += d.toString()));
  contexts.push(ctx);

  await waitUntil(() => /BACKEND_PID:(\d+)/.test(ctx.out), 10_000, `${name} backend pid`);
  ctx.backendPid = Number(/BACKEND_PID:(\d+)/.exec(ctx.out)[1]);
  await waitUntil(() => ctx.out.includes(`PORT:${port}`), 15_000, `${name} PORT line`);
  return ctx;
}

function openWs(port, query = '') {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws${query}`);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

/** Send a Kotlin-style SET_KEEP_ALIVE JSON-RPC notification over /rpc. */
function pushKeepAlive(port, enabled) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/rpc`);
    ws.on('open', () => {
      ws.send(JSON.stringify({ jsonrpc: '2.0', method: 'SET_KEEP_ALIVE', params: { enabled } }));
      // Give the frame a beat to flush, then drop the socket — the gate is
      // backend state, not connection state.
      setTimeout(() => {
        ws.close();
        resolve();
      }, 300);
    });
    ws.on('error', reject);
  });
}

/** Connect /ws, SEND_MESSAGE for a fake-CLI session, resolve on ACK. */
function drive(port, sessionId, workingDir) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const timer = setTimeout(() => reject(new Error(`ws drive timeout (${sessionId})`)), 15_000);
    ws.on('open', () => {
      ws.send(
        JSON.stringify({
          type: 'SEND_MESSAGE',
          requestId: `harness-${sessionId}`,
          timestamp: Date.now(),
          payload: {
            content: 'lifecycle probe',
            workingDir,
            sessionId,
            isNewSession: true,
            inputMode: 'text',
          },
        }),
      );
    });
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'ACK') {
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

async function fetchStatus(port) {
  const res = await fetch(`http://127.0.0.1:${port}/internal/status`);
  return { httpStatus: res.status, body: await res.json() };
}

// ── Scenarios ────────────────────────────────────────────────────────────────

async function s1_baseline(port) {
  const ctx = await startContext('s1', port);
  const ws = await openWs(port);
  await delay(500);
  ws.close();
  const start = Date.now();
  await waitUntil(() => !pidAlive(ctx.backendPid), EXIT_ALLOWANCE_MS, 'S1 idle exit');
  const elapsed = Date.now() - start;
  report('S1 keep-alive OFF: backend exits after the idle grace', true, `${Math.round(elapsed / 1000)}s`);
  report('S1 exit not premature (>= grace)', elapsed >= IDLE_GRACE_MS - 2_000, `${Math.round(elapsed / 1000)}s`);
}

async function s2_gate(port) {
  const ctx = await startContext('s2', port);
  await pushKeepAlive(port, true);
  const ws = await openWs(port);
  await delay(500);
  ws.close();
  await delay(SURVIVE_PROBE_MS);
  report('S2 keep-alive ON: backend survives past the idle grace', pidAlive(ctx.backendPid));
  report('S2 gate log present', ctx.err.includes('Keep-alive enabled'));
}

async function s3_clampWithClient(port) {
  const ctx = await startContext('s3', port);
  await pushKeepAlive(port, true);
  const ws = await openWs(port);
  await delay(500);

  process.kill(ctx.parent.pid, 'SIGKILL');
  await waitUntil(
    () => ctx.err.includes('Parent process') && ctx.err.includes('died'),
    WATCHDOG_POLL_MS + 10_000,
    'S3 watchdog log',
  );
  report('S3 watchdog detected parent death', true);
  await delay(SURVIVE_PROBE_MS);
  report('S3 backend survives parent death while a /ws client is attached', pidAlive(ctx.backendPid));

  ws.close();
  await waitUntil(() => !pidAlive(ctx.backendPid), EXIT_ALLOWANCE_MS, 'S3 exit after client left');
  report('S3 backend exits after the last client leaves', true);
}

async function s4_clampWithoutClients(port) {
  const ctx = await startContext('s4', port);
  await pushKeepAlive(port, true);
  await delay(500);

  process.kill(ctx.parent.pid, 'SIGKILL');
  const start = Date.now();
  await waitUntil(() => !pidAlive(ctx.backendPid), EXIT_ALLOWANCE_MS, 'S4 orphan backend exit');
  const elapsed = Date.now() - start;
  report('S4 client-less backend exits after parent death (watchdog + grace)', true, `${Math.round(elapsed / 1000)}s`);
  report('S4 watchdog log present', ctx.err.includes('keep-alive clamp') || ctx.err.includes('died'));
}

async function s5_prewarmLeakFix(port) {
  const ctx = await startContext('s5', port);
  // What Kotlin does on every /rpc connect, keep-alive toggle OFF: push false.
  // No /ws client EVER connects — before the fix this backend lived forever.
  await pushKeepAlive(port, false);
  const start = Date.now();
  await waitUntil(() => !pidAlive(ctx.backendPid), EXIT_ALLOWANCE_MS, 'S5 prewarm backend exit');
  const elapsed = Date.now() - start;
  report('S5 never-connected backend exits after SET_KEEP_ALIVE(false) push', true, `${Math.round(elapsed / 1000)}s`);
  report('S5 exit not premature (>= grace)', elapsed >= IDLE_GRACE_MS - 2_000, `${Math.round(elapsed / 1000)}s`);
}

async function s6_statusEndpoint(port) {
  const ctx = await startContext('s6', port);
  const empty = await fetchStatus(port);
  report(
    'S6 empty snapshot',
    empty.httpStatus === 200 &&
      empty.body.keepAlive === false &&
      empty.body.connections.total === 0 &&
      empty.body.sessions.total === 0,
    JSON.stringify(empty.body),
  );

  await pushKeepAlive(port, true);
  const panelWs = await openWs(port, '?env=jetbrains&panelId=harness-panel');
  const driveWs = await drive(port, 'harness-status-session', join(ctx.root, 'proj'));
  await delay(1_000);

  const busy = await fetchStatus(port);
  const c = busy.body.connections;
  const s = busy.body.sessions;
  report('S6 keepAlive reflected', busy.body.keepAlive === true);
  report(
    'S6 connection breakdown (1 panel + 1 browser)',
    c.total === 2 && c.panels === 1 && c.browsers === 1 && c.tunnels === 0,
    JSON.stringify(c),
  );
  report(
    'S6 session counters (1 session, 1 streaming — fake CLI never sends result)',
    s.total === 1 && s.streaming === 1,
    JSON.stringify(s),
  );

  panelWs.close();
  driveWs.close();
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  rmSync(ROOT, { recursive: true, force: true });
  mkdirSync(ROOT, { recursive: true });

  const scenarios = [s1_baseline, s2_gate, s3_clampWithClient, s4_clampWithoutClients, s5_prewarmLeakFix, s6_statusEndpoint];
  const outcomes = await Promise.allSettled(scenarios.map((fn, i) => fn(BASE_PORT + i)));
  for (const [i, outcome] of outcomes.entries()) {
    if (outcome.status === 'rejected') {
      report(`S${i + 1} scenario error`, false, String(outcome.reason));
    }
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
    for (const ctx of contexts) {
      for (const pid of [ctx.backendPid, ctx.parent?.pid]) {
        if (pid && pidAlive(pid)) {
          try {
            process.kill(pid, 'SIGKILL');
          } catch {
            // Already gone
          }
        }
      }
    }
  });
