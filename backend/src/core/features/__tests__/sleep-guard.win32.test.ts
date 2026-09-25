import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';

/**
 * #485. What the win32 sleep guard is allowed to do to the user's power plan:
 * nothing.
 *
 * The reporter had set "When plugged in, put the device to sleep after: Never"
 * himself. Our backend read that plan on startup, saw an AC timeout of 0, decided
 * the guard was ours, and on its idle shutdown wrote a hardcoded 30 minutes back
 * over it. The setting was gone without notice and his machine started sleeping
 * mid-work. The DC value stayed where it was, because an `exit` handler cannot
 * await and the second `powercfg` call never ran — so the plan was left
 * half-rewritten as well.
 *
 * These tests force the win32 branch on a macOS/Linux checkout, the way
 * `command.win32.test.ts` already does: a test that only runs on the platform the
 * bug is on is a test nobody here runs, and this bug is only on Windows.
 *
 * The power plan is simulated as a real piece of state rather than asserted
 * through spies alone. Every mocked `child_process` entry point funnels into
 * `runCommand`, which is the ONLY thing that can move `powerPlan` — so any route
 * back to `powercfg /change`, by any author, shows up as the user's setting
 * changing under them.
 */

vi.mock('child_process', () => ({
  exec: vi.fn(),
  execSync: vi.fn(),
  execFile: vi.fn(),
  execFileSync: vi.fn(),
  spawn: vi.fn(),
  spawnSync: vi.fn(),
}));

import {
  exec as cpExec,
  execSync as cpExecSync,
  execFile as cpExecFile,
  execFileSync as cpExecFileSync,
  spawn as cpSpawn,
  spawnSync as cpSpawnSync,
} from 'child_process';

const mockExec = vi.mocked(cpExec);
const mockExecSync = vi.mocked(cpExecSync);
const mockExecFile = vi.mocked(cpExecFile);
const mockExecFileSync = vi.mocked(cpExecFileSync);
const mockSpawn = vi.mocked(cpSpawn);
const mockSpawnSync = vi.mocked(cpSpawnSync);

// ─── The simulated Windows power plan ───────────────────────────────────────
// Timeouts in seconds, the unit `powercfg /query` reports them in (0x708 = 1800
// = the 30 minutes the reporter's plan was overwritten with). `powercfg /change`
// takes minutes, so the conversion happens where that command is parsed.

interface PowerPlan {
  /** Standby timeout while plugged in. 0 means "Never", which is what the reporter set. */
  ac: number;
  /** Standby timeout on battery. */
  dc: number;
}

let powerPlan: PowerPlan;
/** Every command line any child_process entry point was asked to run. */
let commandLines: string[];

function queryOutput(): string {
  const hex = (seconds: number): string => `0x${seconds.toString(16).padStart(8, '0')}`;
  return [
    'Power Scheme GUID: 381b4222-f694-41f0-9685-ff5bb260df2e  (Balanced)',
    '  Subgroup GUID: 238c9fa8-0aad-41ed-83f4-97be242c8f20  (Sleep)',
    '    Power Setting GUID: 29f6c1db-86da-48c5-9fdb-f2b67b1f44da  (Sleep after)',
    `      Current AC Power Setting Index: ${hex(powerPlan.ac)}`,
    `      Current DC Power Setting Index: ${hex(powerPlan.dc)}`,
    '',
  ].join('\n');
}

/** The one place a command can change the plan. Returns the command's stdout. */
function runCommand(commandLine: string): string {
  commandLines.push(commandLine);

  const change = /standby-timeout-(ac|dc)\s+(\d+)/i.exec(commandLine);
  if (/\/change/i.test(commandLine) && change) {
    const minutes = Number(change[2]);
    if (change[1].toLowerCase() === 'ac') powerPlan.ac = minutes * 60;
    else powerPlan.dc = minutes * 60;
    return '';
  }
  if (/\/query/i.test(commandLine)) return queryOutput();
  return '';
}

/** Command lines that reached `powercfg`, whichever entry point carried them. */
function powercfgCalls(): string[] {
  return commandLines.filter((line) => /powercfg/i.test(line));
}

// ─── The fake helper process ────────────────────────────────────────────────

type HelperBehavior = 'ready' | 'dies' | 'silent';
let helperBehavior: HelperBehavior;

class FakeStream extends EventEmitter {
  unref = vi.fn();
}

class FakeProcess extends EventEmitter {
  stdin = new FakeStream();
  stdout = new FakeStream();
  stderr = new FakeStream();
  pid = 4321;
  unref = vi.fn();
  kill = vi.fn();
}

let helper: FakeProcess | null;

function spawnImpl(command: string, args?: unknown): unknown {
  const argv = Array.isArray(args) ? (args as string[]) : [];
  runCommand([command, ...argv].join(' '));

  const proc = new FakeProcess();
  helper = proc;

  // The backend attaches its readiness listeners synchronously right after this
  // returns, so the helper's answer is queued rather than emitted inline.
  queueMicrotask(() => {
    if (helperBehavior === 'ready') {
      proc.stdout.emit('data', Buffer.from('CCG_SLEEP_GUARD_READY\n'));
    } else if (helperBehavior === 'dies') {
      proc.stderr.emit('data', Buffer.from('Add-Type : Cannot compile in this language mode\n'));
      proc.emit('exit', 1, null);
    }
    // 'silent': the helper starts and says nothing, which is the case where the
    // machine is free to sleep while the toggle claims it is not.
  });

  return proc;
}

type ExecCallback = (err: Error | null, result: { stdout: string; stderr: string }) => void;

function execImpl(commandLine: string, a?: unknown, b?: unknown): unknown {
  const callback = (typeof a === 'function' ? a : b) as ExecCallback | undefined;
  const stdout = runCommand(commandLine);
  // `promisify(exec)` without the real custom symbol resolves with this single
  // value, which is exactly the `{ stdout }` shape the old code destructured.
  callback?.(null, { stdout, stderr: '' });
  return new FakeProcess();
}

// ─── Loading the module under test ──────────────────────────────────────────

type SleepGuardModule = typeof import('../sleep-guard');
type ExitHandler = () => void;

/**
 * Import the module fresh (its guard state lives in module scope) while capturing
 * the `process.on` registrations it makes at import time. The captured handlers are
 * run directly instead of emitting on the real `process`, so the test never
 * disturbs the listeners vitest and Node have on it.
 */
async function loadSleepGuard(): Promise<{ mod: SleepGuardModule; handlers: Map<string, ExitHandler[]> }> {
  vi.resetModules();
  const handlers = new Map<string, ExitHandler[]>();
  const onSpy = vi.spyOn(process, 'on').mockImplementation(((event: string, handler: ExitHandler) => {
    const list = handlers.get(event) ?? [];
    list.push(handler);
    handlers.set(event, list);
    return process;
  }) as never);
  const mod = await import('../sleep-guard');
  onSpy.mockRestore();
  return { mod, handlers };
}

function runHandlers(handlers: Map<string, ExitHandler[]>, event: string): void {
  for (const handler of handlers.get(event) ?? []) handler();
}

/** Let every promise the code under test may be holding settle. */
async function drainMicrotasks(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

let platformSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  powerPlan = { ac: 0, dc: 600 };
  commandLines = [];
  helperBehavior = 'ready';
  helper = null;
  platformSpy = vi.spyOn(process, 'platform', 'get');
  platformSpy.mockReturnValue('win32');
  mockExec.mockImplementation(execImpl as never);
  mockSpawn.mockImplementation(spawnImpl as never);
  mockExecSync.mockImplementation(((line: string) => runCommand(line)) as never);
  mockSpawnSync.mockImplementation(((command: string, args?: unknown) => {
    runCommand([command, ...(Array.isArray(args) ? (args as string[]) : [])].join(' '));
    return { status: 0, stdout: '', stderr: '' };
  }) as never);
  mockExecFile.mockImplementation(((file: string, args: unknown, _opts: unknown, cb?: ExecCallback) => {
    runCommand([file, ...(Array.isArray(args) ? (args as string[]) : [])].join(' '));
    cb?.(null, { stdout: '', stderr: '' });
    return new FakeProcess();
  }) as never);
  mockExecFileSync.mockImplementation(((file: string, args?: unknown) => {
    runCommand([file, ...(Array.isArray(args) ? (args as string[]) : [])].join(' '));
    return '';
  }) as never);
});

afterEach(() => {
  platformSpy.mockRestore();
});

describe('win32 sleep guard and a power setting the user made', () => {
  it('leaves a user-set "Never sleep" exactly as it was across a full backend start and shutdown', async () => {
    // The reporter's machine: he set AC to Never himself, battery stayed at 10 min,
    // and he never turned our guard on.
    powerPlan = { ac: 0, dc: 600 };

    const { mod, handlers } = await loadSleepGuard();
    await mod.restoreSleepGuardState();

    // An AC timeout of 0 is what a user's own "Never" looks like, so it is not
    // evidence of anything we did. Adopting it here is what armed the shutdown
    // that overwrote his plan.
    expect(mod.getSleepGuardStatus().enabled).toBe(false);

    runHandlers(handlers, 'exit');
    await drainMicrotasks();

    expect(powerPlan).toEqual({ ac: 0, dc: 600 });
    expect(powercfgCalls()).toEqual([]);
  });

  it('never reads or writes the power plan, on startup or on shutdown, even with the guard on', async () => {
    powerPlan = { ac: 1800, dc: 600 };

    const { mod, handlers } = await loadSleepGuard();
    await mod.restoreSleepGuardState();
    await mod.enableSleepGuard();
    await mod.disableSleepGuard();
    runHandlers(handlers, 'exit');
    runHandlers(handlers, 'SIGTERM');
    await drainMicrotasks();

    expect(powerPlan).toEqual({ ac: 1800, dc: 600 });
    expect(powercfgCalls()).toEqual([]);
  });
});

describe('win32 sleep guard, the guard we turn on ourselves', () => {
  it('holds the request in a helper process instead of editing the power plan', async () => {
    const { mod } = await loadSleepGuard();
    await mod.enableSleepGuard();

    expect(mod.getSleepGuardStatus().enabled).toBe(true);

    const [command, args] = mockSpawn.mock.calls[0];
    expect(String(command).toLowerCase()).toContain('powershell');

    const argv = args as string[];
    const encoded = argv[argv.indexOf('-EncodedCommand') + 1];
    const script = Buffer.from(encoded, 'base64').toString('utf16le');

    // ES_CONTINUOUS | ES_SYSTEM_REQUIRED, written in decimal because PowerShell
    // reads a full-width hex literal as a negative Int32 that will not convert.
    expect(script).toContain('SetThreadExecutionState');
    expect(script).toContain('2147483649');
    // The hold lives in the helper's thread, and that thread waits on the backend
    // that asked for it — so a backend killed outright still takes the hold with it
    // instead of leaving a stranger keeping the machine awake.
    expect(script).toContain(`Get-Process -Id ${process.pid} `);
    expect(script).toContain('WaitForExit()');
    // And it must not reach for the plan by another name.
    expect(script.toLowerCase()).not.toContain('powercfg');
  });

  it('releases the guard inside the exit handler itself, not in a promise the exit drops', async () => {
    const { mod, handlers } = await loadSleepGuard();
    await mod.enableSleepGuard();
    expect(helper).not.toBeNull();

    runHandlers(handlers, 'exit');

    // Asserted with no `await` in between on purpose: `process.on('exit')` runs to
    // the end of its turn and no further. The old win32 release was two awaited
    // `powercfg` calls, and the second one never happened.
    expect(helper?.kill).toHaveBeenCalledTimes(1);
    expect(mod.getSleepGuardStatus().enabled).toBe(false);
  });

  it('stays off, loudly, when the helper cannot hold the request', async () => {
    helperBehavior = 'dies';
    const { mod } = await loadSleepGuard();

    await expect(mod.enableSleepGuard()).rejects.toThrow(/sleep guard helper/i);

    // The toggle reports the truth and the plan is still the user's. A `powercfg`
    // fallback here would be the reported damage, re-entered through the failure path.
    expect(mod.getSleepGuardStatus().enabled).toBe(false);
    expect(powercfgCalls()).toEqual([]);
  });

  it('does not report itself on while the helper has said nothing', async () => {
    vi.useFakeTimers();
    try {
      helperBehavior = 'silent';
      const { mod } = await loadSleepGuard();

      const pending = mod.enableSleepGuard();
      const settled = expect(pending).rejects.toThrow(/readiness/i);
      await vi.advanceTimersByTimeAsync(11_000);
      await settled;

      expect(mod.getSleepGuardStatus().enabled).toBe(false);
      expect(helper?.kill).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
