import { spawn, spawnSync } from 'child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { homedir, userInfo } from 'os';
import { dirname, join } from 'path';

/**
 * Keeping the machine awake when the lid is closed.
 *
 * A held sleep request does not do this. Measured on macOS and on Windows: with
 * the request held and the lid closed, both machines went to sleep (macOS logged
 * `Clamshell Sleep`; Windows logged a Modern Standby entry and its heartbeat
 * stopped for 140 s). The only thing that changed the outcome on either was a
 * system setting: `pmset disablesleep 1` on macOS, and the power plan's "lid close
 * action" set to "do nothing" on Windows.
 *
 * So this file changes a system setting. That is a bigger act than holding a
 * request, and it is done under one rule: we never treat the setting as ours.
 *
 *   - What the system held before we touched it is recorded (`external`).
 *   - If anyone else changes it while we hold it, `external` follows them, and the
 *     user is told. We do not fight for the value.
 *   - Turning the guard off, or the backend ending, puts `external` back.
 *
 * Several backends can run at once (one per IDE window) and share one system
 * setting, so the state file lists the live backends holding it. The setting is
 * put back only when the last of them lets go.
 *
 * Linux needs none of this: `systemd-inhibit --what=handle-lid-switch` is a
 * request like the sleep one, so it is added to that helper instead.
 *
 * Everything here is synchronous on purpose. The release must run inside an `exit`
 * handler, which runs to the end of its turn and no further.
 */

/** What a strategy reads from, and writes back to, the system. */
export type Snapshot = Record<string, string | number>;

export interface LidStrategy {
  /** The setting as the system holds it now, or null when it cannot be read. */
  read(): Snapshot | null;
  /** Put the system into "closing the lid does not sleep". Returns that state. */
  apply(): Snapshot;
  /** Put the system back exactly as `snapshot` describes. */
  restore(snapshot: Snapshot): void;
  /** How the system, as read now, compares with the state `apply()` made. */
  compare(current: Snapshot, applied: Snapshot): 'same' | 'changed' | 'other-scheme';
}

/** Changing the setting needs an administrator's permission we do not hold yet. */
export class LidAuthorizationRequired extends Error {
  constructor() {
    super('Administrator permission is needed to keep the Mac awake with the lid closed');
    this.name = 'LidAuthorizationRequired';
  }
}

// ─── State shared by every backend on this machine ──────────────────────────

interface LidState {
  /** What the user last chose for the switch (kept by sleep-guard.ts). */
  enabled?: boolean;
  /** Backends currently holding the setting. */
  holders?: number[];
  /** The state we put the system in. */
  applied?: Snapshot | null;
  /** What the system held before us, or what the last outsider set it to. */
  external?: Snapshot | null;
}

export function stateFilePath(): string {
  return join(process.env.CCG_HOME || join(homedir(), '.claude-code-gui'), 'sleep-guard.json');
}

function readState(): LidState {
  try {
    const parsed: unknown = JSON.parse(readFileSync(stateFilePath(), 'utf8'));
    return parsed && typeof parsed === 'object' ? (parsed as LidState) : {};
  } catch {
    return {};
  }
}

function writeState(state: LidState): void {
  const path = stateFilePath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(state, null, 2) + '\n', 'utf8');
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM means the process exists and belongs to someone else.
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

function otherLiveHolders(state: LidState): number[] {
  return (state.holders ?? []).filter((pid) => pid !== process.pid && isAlive(pid));
}

// ─── The lifecycle ───────────────────────────────────────────────────────────

/** Take hold of the setting for this backend. Throws if it cannot be applied. */
export function acquireLid(strategy: LidStrategy): void {
  const state = readState();
  const live = otherLiveHolders(state);
  const current = strategy.read();
  if (!current) throw new Error('Could not read the lid close setting from the system');

  // Keep the recorded original when someone is already holding the setting, or
  // when a backend that held it died and left it applied. Reading it now would
  // record our own value as the user's.
  const stillOurs = !!state.applied && strategy.compare(current, state.applied) === 'same';
  const external = state.external && (live.length > 0 || stillOurs) ? state.external : current;

  const applied = strategy.apply();
  writeState({ ...state, holders: [...live, process.pid], applied, external });
}

/** Let go of the setting. The last holder to leave puts the original back. */
export function releaseLid(strategy: LidStrategy): void {
  const state = readState();
  if (!state.applied) {
    writeState({ ...state, holders: otherLiveHolders(state) });
    return;
  }

  const live = otherLiveHolders(state);
  if (live.length > 0) {
    writeState({ ...state, holders: live });
    return;
  }

  if (state.external) {
    try {
      strategy.restore(state.external);
    } catch (err) {
      // Leave `applied`/`external` in the file: the next start sees a setting we
      // still hold and retries the restore rather than losing the original.
      console.error('[node-backend]', 'Could not put the lid close setting back:', err);
      writeState({ ...state, holders: [] });
      return;
    }
  }
  writeState({ ...state, holders: [], applied: null, external: null });
}

export type LidPoll = 'ok' | 'external-changed' | 'scheme-changed';

/**
 * Compare the system with what we set. If an outsider changed it, `external`
 * follows them, so turning the guard off puts back THEIR value rather than a
 * stale one. We do not re-apply ours.
 */
export function pollLid(strategy: LidStrategy): LidPoll {
  const state = readState();
  if (!state.applied) return 'ok';

  const current = strategy.read();
  if (!current) return 'ok';

  const result = strategy.compare(current, state.applied);
  if (result === 'changed') {
    // Follow the outsider field by field. A field that still holds OUR value keeps
    // the original recorded before us: taking it from `current` would record our
    // own value as the user's, and turning the guard off would leave it behind.
    const previous = state.external ?? {};
    const external: Snapshot = {};
    for (const key of Object.keys(current)) {
      external[key] = current[key] !== state.applied[key] ? current[key] : (previous[key] ?? current[key]);
    }
    writeState({ ...state, external });
    return 'external-changed';
  }
  return result === 'other-scheme' ? 'scheme-changed' : 'ok';
}

// ─── macOS ───────────────────────────────────────────────────────────────────

const PMSET = '/usr/bin/pmset';
const SUDO = '/usr/bin/sudo';

/** The only two commands the sudoers rule allows, spelled exactly as it lists them. */
function pmsetDisableSleep(value: number): void {
  const result = spawnSync(SUDO, ['-n', PMSET, '-a', 'disablesleep', String(value)], { encoding: 'utf8' });
  if (result.status === 0) return;
  const message = String(result.stderr ?? '');
  if (/password is required|a terminal is required/i.test(message)) throw new LidAuthorizationRequired();
  throw new Error(`pmset disablesleep ${value} failed: ${message.trim() || `exit ${result.status}`}`);
}

const macStrategy: LidStrategy = {
  read() {
    const result = spawnSync(PMSET, ['-g'], { encoding: 'utf8' });
    const match = /SleepDisabled\s+(\d+)/.exec(String(result.stdout ?? ''));
    return match ? { disableSleep: Number(match[1]) } : null;
  },
  apply() {
    pmsetDisableSleep(1);
    return { disableSleep: 1 };
  },
  restore(snapshot) {
    pmsetDisableSleep(Number(snapshot.disableSleep));
  },
  compare(current, applied) {
    return current.disableSleep === applied.disableSleep ? 'same' : 'changed';
  },
};

const SUDOERS_FILE = '/etc/sudoers.d/swttch-pmset';
const AUTH_PROMPT = 'Swttch needs your permission once, so it can keep this Mac awake with the lid closed and put the setting back afterwards.';

/** AppleScript string literal: backslash and double quote are the only escapes. */
function appleScriptString(text: string): string {
  return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/**
 * Ask macOS to authorize, once, exactly two commands: `pmset -a disablesleep 1`
 * and `pmset -a disablesleep 0`.
 *
 * The password is typed into macOS's own dialog and never reaches this process,
 * the WebView, or the WebSocket. The rule is checked with `visudo -c` before it is
 * installed, because a malformed file in /etc/sudoers.d breaks `sudo` for the whole
 * machine. To remove it: `sudo rm /etc/sudoers.d/swttch-pmset`.
 */
export function installMacPmsetRule(): Promise<void> {
  const user = userInfo().username;
  if (!/^[A-Za-z0-9._-]+$/.test(user)) {
    return Promise.reject(new Error(`Refusing to write a sudoers rule for the unusual user name "${user}"`));
  }

  const rule = `${user} ALL=(root) NOPASSWD: ${PMSET} -a disablesleep 1, ${PMSET} -a disablesleep 0`;
  const script = [
    'tmp=$(/usr/bin/mktemp)',
    `&& /usr/bin/printf '%s\\n' '${rule}' > "$tmp"`,
    '&& /usr/sbin/visudo -cf "$tmp"',
    '&& /usr/bin/install -d -m 0755 /etc/sudoers.d',
    `&& /usr/bin/install -m 0440 -o root -g wheel "$tmp" ${SUDOERS_FILE};`,
    'status=$?; /bin/rm -f "$tmp"; exit $status',
  ].join(' ');

  return new Promise((resolve, reject) => {
    const proc = spawn(
      '/usr/bin/osascript',
      ['-e', `do shell script ${appleScriptString(script)} with administrator privileges with prompt ${appleScriptString(AUTH_PROMPT)}`],
      { stdio: ['ignore', 'ignore', 'pipe'] },
    );
    let stderr = '';
    proc.stderr?.on('data', (chunk) => { stderr += String(chunk); });
    proc.on('error', reject);
    proc.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(/cancel/i.test(stderr) ? 'Authorization was canceled' : `Authorization failed: ${stderr.trim() || `exit ${code}`}`));
    });
  });
}

// ─── Windows ─────────────────────────────────────────────────────────────────

const GUID = /[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}/;
const SUB_BUTTONS = '4f971e89-eebd-4455-a8de-9e59040e7347';
const LID_ACTION = '5ca83367-6e45-459f-a27b-476b1d01c936';
/** "Do nothing" in the lid close action's list of choices. */
const LID_DO_NOTHING = 0;

function powercfg(args: string[]): { ok: boolean; out: string; err: string } {
  const result = spawnSync('powercfg', args, { encoding: 'utf8', windowsHide: true });
  return { ok: result.status === 0, out: String(result.stdout ?? ''), err: String(result.stderr ?? '') };
}

function activeScheme(): string | null {
  return GUID.exec(powercfg(['/getactivescheme']).out)?.[0] ?? null;
}

/**
 * Values are read by the "AC"/"DC" tokens and the hex number, not by the words
 * around them: Windows translates `powercfg`'s output, so a Korean machine prints that
 * line in Korean where an English one prints `Current AC Power Setting Index:`.
 */
function readLidValues(scheme: string): { ac: number; dc: number } | null {
  const out = powercfg(['/qh', scheme, SUB_BUTTONS, LID_ACTION]).out;
  const ac = /\bAC\b[^\n]*?0x([0-9a-fA-F]+)/.exec(out)?.[1];
  const dc = /\bDC\b[^\n]*?0x([0-9a-fA-F]+)/.exec(out)?.[1];
  return ac !== undefined && dc !== undefined ? { ac: parseInt(ac, 16), dc: parseInt(dc, 16) } : null;
}

function writeLidValues(scheme: string, ac: number, dc: number): void {
  for (const [flag, value] of [['/setacvalueindex', ac], ['/setdcvalueindex', dc]] as const) {
    const result = powercfg([flag, scheme, SUB_BUTTONS, LID_ACTION, String(value)]);
    if (!result.ok) throw new Error(`powercfg ${flag} failed: ${result.err.trim() || result.out.trim()}`);
  }
  // Re-activating the scheme that is active NOW makes the change take effect; it
  // never switches the user to another scheme.
  const active = activeScheme();
  if (active) powercfg(['/setactive', active]);
}

const windowsStrategy: LidStrategy = {
  read() {
    const scheme = activeScheme();
    const values = scheme ? readLidValues(scheme) : null;
    return scheme && values ? { scheme, ...values } : null;
  },
  apply() {
    const scheme = activeScheme();
    if (!scheme) throw new Error('Could not find the active power plan');
    writeLidValues(scheme, LID_DO_NOTHING, LID_DO_NOTHING);
    return { scheme, ac: LID_DO_NOTHING, dc: LID_DO_NOTHING };
  },
  restore(snapshot) {
    writeLidValues(String(snapshot.scheme), Number(snapshot.ac), Number(snapshot.dc));
  },
  compare(current, applied) {
    // The user switched to another power plan. Ours is no longer the one in force,
    // and it still holds our value, so this is reported rather than "fixed".
    if (current.scheme !== applied.scheme) return 'other-scheme';
    return current.ac === applied.ac && current.dc === applied.dc ? 'same' : 'changed';
  },
};

/** The strategy for this platform, or null where there is no setting to change. */
export function createLidStrategy(platform: NodeJS.Platform): LidStrategy | null {
  if (platform === 'darwin') return macStrategy;
  if (platform === 'win32') return windowsStrategy;
  return null;
}
