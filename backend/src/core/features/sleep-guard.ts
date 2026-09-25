import { spawn, type ChildProcess } from 'child_process';

export interface SleepGuardStatus {
  enabled: boolean;
  platform: string;
}

let sleepGuardEnabled = false;
let inhibitProcess: ChildProcess | null = null;

/**
 * win32 sleep guard: a helper process that HOLDS a sleep request, the same shape
 * macOS (`caffeinate`) and Linux (`systemd-inhibit`) already have.
 *
 * Why it is no longer `powercfg /change` (#485): that command edits the user's
 * active power plan, which is permanent state the user owns. The old code wrote
 * `standby-timeout-ac 0` to turn the guard on and hardcoded `30`/`15` to turn it
 * off, so a reporter who had set "Never sleep" himself lost that setting the
 * moment our backend idled out — it had never been read, let alone saved. Worse,
 * startup inferred "the guard is ours" from an AC timeout of 0, which is exactly
 * what a user's own "Never" looks like, and the `exit` hook could not await the
 * second `powercfg` call, so the plan was left half-rewritten (AC changed, DC not).
 *
 * A held execution-state request has none of that surface: it lives in the holding
 * thread, it is invisible to the power plan, and it is gone the moment the thread
 * is — killed, crashed, or the machine rebooted. There is nothing to save and
 * nothing to restore, so none of the three failures above can be written again.
 *
 * The request is taken with `SetThreadExecutionState(ES_CONTINUOUS |
 * ES_SYSTEM_REQUIRED)`, the documented Win32 call for "do not sleep while I work",
 * reached from PowerShell — the same `Add-Type` route `win-job-wrapper.ps1`
 * already takes in production. The script travels as `-EncodedCommand` (base64
 * UTF-16LE, PowerShell's own documented way to pass a script without a quoting
 * round-trip) so no extra asset has to be copied into all three distributables.
 *
 * The helper waits on the backend's own process handle, so it cannot outlive the
 * backend that asked for the request even if that backend is killed outright.
 */

/** The line the helper prints once the request is actually held. */
const WIN32_READY_LINE = 'CCG_SLEEP_GUARD_READY';

/** How long to wait for that line before giving up on the helper. */
const WIN32_READY_TIMEOUT_MS = 10_000;

/**
 * ES_CONTINUOUS (0x80000000) | ES_SYSTEM_REQUIRED (0x00000001), written in decimal
 * on purpose: PowerShell reads a hex literal that fills 32 bits as a NEGATIVE Int32,
 * and the negative value will not convert to the `uint` parameter. A decimal literal
 * this large is an Int64, which converts cleanly.
 *
 * ES_DISPLAY_REQUIRED is deliberately absent — the guard keeps the machine awake,
 * it does not keep the screen lit, which matches `caffeinate -s -i` on macOS.
 */
const WIN32_EXECUTION_STATE = 2147483649;

function win32InhibitScript(backendPid: number): string {
  return [
    `$ErrorActionPreference = 'Stop'`,
    `Add-Type -Name Power -Namespace Ccg -MemberDefinition '[DllImport("kernel32.dll", SetLastError = true)] public static extern uint SetThreadExecutionState(uint esFlags);'`,
    `if ([Ccg.Power]::SetThreadExecutionState([uint32]${WIN32_EXECUTION_STATE}) -eq 0) {`,
    `  [Console]::Error.WriteLine('SetThreadExecutionState returned 0')`,
    `  exit 1`,
    `}`,
    `[Console]::Out.WriteLine('${WIN32_READY_LINE}')`,
    `[Console]::Out.Flush()`,
    // The request belongs to THIS thread, so the thread has to stay in place — and
    // it must not stay longer than the backend that asked for it. Waiting on the
    // backend's own handle ends the hold even when the backend dies without ever
    // reaching its release path (killed outright, or crashed), so the one failure
    // this design could still have — a helper outliving its backend and keeping the
    // machine awake with nobody left to turn it off — cannot happen.
    `$backend = Get-Process -Id ${backendPid} -ErrorAction SilentlyContinue`,
    `if ($backend) { $backend.WaitForExit() }`,
  ].join('\n');
}

/** PowerShell's `-EncodedCommand` is base64 of the UTF-16LE script text. */
function encodeWin32Script(script: string): string {
  return Buffer.from(script, 'utf16le').toString('base64');
}

function spawnWin32Inhibitor(): ChildProcess {
  return spawn(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-EncodedCommand',
      encodeWin32Script(win32InhibitScript(process.pid)),
    ],
    // stdout carries the readiness line and stderr the reason when there is none;
    // stdin is closed so nothing about this depends on how PowerShell treats a
    // redirected console input. windowsHide keeps a console window from flashing
    // over the IDE.
    { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true },
  );
}

/**
 * Resolve once the helper reports the request is held; reject if it dies, fails to
 * start, or says nothing in time. The guard must never report itself ON while the
 * machine is free to sleep — that is the one state the user cannot detect until the
 * machine has already slept.
 */
function awaitWin32Ready(proc: ChildProcess): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stdoutText = '';
    let stderrText = '';

    const finish = (err?: Error): void => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      proc.stdout?.off('data', onStdout);
      proc.stderr?.off('data', onStderr);
      proc.off('exit', onExit);
      proc.off('error', onError);
      if (err) reject(err);
      else resolve();
    };

    const onStdout = (chunk: Buffer | string): void => {
      stdoutText += String(chunk);
      if (stdoutText.includes(WIN32_READY_LINE)) finish();
    };
    const onStderr = (chunk: Buffer | string): void => {
      stderrText += String(chunk);
    };
    const onExit = (code: number | null, signal: NodeJS.Signals | null): void => {
      const detail = stderrText.trim();
      finish(new Error(
        `sleep guard helper exited before holding the request (code=${code} signal=${signal})`
        + (detail ? `: ${detail}` : ''),
      ));
    };
    const onError = (err: Error): void => {
      finish(new Error(`sleep guard helper could not start: ${err.message}`));
    };

    timer = setTimeout(() => {
      finish(new Error('sleep guard helper did not report readiness in time'));
    }, WIN32_READY_TIMEOUT_MS);

    proc.stdout?.on('data', onStdout);
    proc.stderr?.on('data', onStderr);
    proc.on('exit', onExit);
    proc.on('error', onError);
  });
}

/** Let the backend's event loop drain even though the helper is still held open. */
function unrefInhibitProcess(proc: ChildProcess): void {
  const unrefStream = (stream: unknown): void => {
    (stream as { unref?: () => void } | null | undefined)?.unref?.();
  };
  proc.unref();
  unrefStream(proc.stdin);
  unrefStream(proc.stdout);
  unrefStream(proc.stderr);
}

/**
 * Kill whatever inhibitor is held, synchronously. `process.on('exit')` cannot await,
 * so the release path has to finish inside one turn — that constraint is what the
 * old win32 path failed (#485): its second `powercfg` call never ran.
 */
function stopInhibitProcess(label: string): void {
  if (!inhibitProcess) return;
  try {
    inhibitProcess.kill('SIGTERM');
  } catch (err) {
    console.error('[node-backend]', `Failed to kill ${label} process:`, err);
  }
  inhibitProcess = null;
}

export async function enableSleepGuard(): Promise<void> {
  const platform = process.platform;

  try {
    if (platform === 'darwin') {
      if (inhibitProcess) {
        sleepGuardEnabled = true;
        return;
      }
      // caffeinate -s: prevent system sleep (including lid close)
      // caffeinate -i: prevent idle sleep
      const proc = spawn('caffeinate', ['-s', '-i'], {
        stdio: 'ignore',
        detached: true,
      });
      proc.unref();
      inhibitProcess = proc;

      proc.on('error', (err) => {
        console.error('[node-backend]', 'caffeinate error:', err);
        inhibitProcess = null;
        sleepGuardEnabled = false;
      });

      proc.on('exit', (code, signal) => {
        console.error('[node-backend]', `caffeinate exited code=${code} signal=${signal}`);
        inhibitProcess = null;
        sleepGuardEnabled = false;
      });
    } else if (platform === 'linux') {
      if (inhibitProcess) {
        // Already inhibiting
        sleepGuardEnabled = true;
        return;
      }
      const proc = spawn(
        'systemd-inhibit',
        [
          '--what=sleep',
          '--who=Claude Code GUI',
          '--why=Tunnel active',
          'sleep',
          'infinity',
        ],
        {
          stdio: 'ignore',
          detached: true,
        }
      );
      proc.unref();
      inhibitProcess = proc;

      proc.on('error', (err) => {
        console.error('[node-backend]', 'systemd-inhibit error:', err);
        inhibitProcess = null;
        sleepGuardEnabled = false;
      });

      proc.on('exit', (code, signal) => {
        console.error('[node-backend]', `systemd-inhibit exited code=${code} signal=${signal}`);
        inhibitProcess = null;
        sleepGuardEnabled = false;
      });
    } else if (platform === 'win32') {
      if (inhibitProcess) {
        // Already holding the request
        sleepGuardEnabled = true;
        return;
      }
      const proc = spawnWin32Inhibitor();
      try {
        await awaitWin32Ready(proc);
      } catch (err) {
        // There is deliberately NO `powercfg` fallback. Editing the user's power
        // plan is the damage this feature caused; a guard that cannot be held
        // without doing that is a guard we do not turn on.
        try {
          proc.kill('SIGTERM');
        } catch {
          // the helper is already gone, which is the state we wanted anyway
        }
        throw err;
      }
      inhibitProcess = proc;
      unrefInhibitProcess(proc);

      proc.stderr?.on('data', (chunk: Buffer | string) => {
        const text = String(chunk).trim();
        if (text) console.error('[node-backend]', 'sleep guard helper:', text);
      });

      proc.on('error', (err) => {
        console.error('[node-backend]', 'sleep guard helper error:', err);
        inhibitProcess = null;
        sleepGuardEnabled = false;
      });

      proc.on('exit', (code, signal) => {
        console.error('[node-backend]', `sleep guard helper exited code=${code} signal=${signal}`);
        inhibitProcess = null;
        sleepGuardEnabled = false;
      });
    } else {
      console.error('[node-backend]', `enableSleepGuard: unsupported platform ${platform}`);
      return;
    }

    sleepGuardEnabled = true;
  } catch (err) {
    console.error('[node-backend]', 'Failed to enable sleep guard:', err);
    throw err;
  }
}

export async function disableSleepGuard(): Promise<void> {
  const platform = process.platform;

  try {
    if (platform === 'darwin') {
      stopInhibitProcess('caffeinate');
    } else if (platform === 'linux') {
      stopInhibitProcess('inhibit');
    } else if (platform === 'win32') {
      // Killing the helper ends its thread, and the execution-state request ends
      // with it. Nothing on disk or in the power plan is written back, because
      // nothing there was ever written.
      stopInhibitProcess('sleep guard helper');
    } else {
      console.error('[node-backend]', `disableSleepGuard: unsupported platform ${platform}`);
      return;
    }

    sleepGuardEnabled = false;
  } catch (err) {
    console.error('[node-backend]', 'Failed to disable sleep guard:', err);
    throw err;
  }
}

/**
 * Called on backend startup, when a previous backend may have died holding a guard.
 *
 * It restores nothing, and that is the whole point. Every platform's guard is now a
 * process we hold, and a process does not outlive the backend that spawned it, so
 * there is no leftover state for a new backend to adopt. The win32 branch used to
 * read the active power plan here and call an AC timeout of 0 "ours" — a reading a
 * user who set "Never sleep" himself can never win (#485). A guard we cannot prove
 * we own is not ours, so startup claims nothing.
 */
export async function restoreSleepGuardState(): Promise<void> {
  // Intentionally empty. Kept as the startup seam so the rule above has one place
  // to live, and so a future guard that DOES survive a restart has somewhere to be
  // adopted from — with proof of ownership, which the power plan cannot give.
}

export function getSleepGuardStatus(): SleepGuardStatus {
  return {
    enabled: sleepGuardEnabled,
    platform: process.platform,
  };
}

// Cleanup on process exit. Synchronous on purpose: an `exit` handler runs to the
// end of the current turn and no further, so anything left in a promise is dropped.
process.on('exit', () => {
  if (sleepGuardEnabled) {
    stopInhibitProcess('sleep guard');
    sleepGuardEnabled = false;
  }
});

process.on('SIGTERM', () => {
  if (sleepGuardEnabled) {
    stopInhibitProcess('sleep guard');
    sleepGuardEnabled = false;
  }
});
