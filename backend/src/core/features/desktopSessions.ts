import { spawn, type ChildProcess } from 'child_process';
import { runLauncher } from '../run-launcher';
import { isNewerVersion } from '../cli-update';
import { getSessionMcpVersion, resolveSessionMcpEntry } from '../session-mcp';

/**
 * What the Claude desktop app records about its sessions: who started whom, which are archived, the titles it
 * shows, and which have a turn running.
 *
 * This plugin never opens the desktop app's files. All of it is the session-management MCP's business
 * (`@swttch/session-manager-mcp`): the package reads and watches that folder, and this backend only runs the
 * package's own commands (`desktop-state`, `desktop-session`, `started-by`, `desktop-watch`) with this process's
 * Node and the package's entry script, and reads what they print. Like the extend kit, the package is never
 * imported. A package that is not installed, or is older than the version that has these commands, answers
 * nothing: the desktop app's records are then simply not shown.
 */

/** The first package version that has the desktop commands. */
export const DESKTOP_COMMANDS_SINCE = '0.5.0';

const COMMAND_TIMEOUT_MS = 15_000;
const COMMAND_MAX_BUFFER = 10 * 1024 * 1024;
/** After the watching command ends on its own (it crashed), it is started again after this long. */
const RESTART_AFTER_MS = 5_000;

/** The desktop app's records, by the CLI id of each session. */
export interface DesktopSessionState {
  /** For every session the desktop app draws under another one: the CLI id of the session, to the CLI id of the one it is under. */
  starters: Map<string, string>;
  /** The sessions archived in the desktop app. */
  archived: Set<string>;
  /** The title the desktop app shows for each session. */
  titles: Map<string, string>;
  /** The sessions with a turn in flight in the desktop app. */
  running: Set<string>;
}

/** What moved in the desktop app since the last look. */
export interface DesktopChange {
  /** Who is under whom, what is archived, or a title: the session list has to be read again. */
  list: boolean;
  /** Which sessions have a turn in flight. */
  running: boolean;
}

export const EMPTY_DESKTOP_STATE: DesktopSessionState = {
  starters: new Map(),
  archived: new Set(),
  titles: new Map(),
  running: new Set(),
};

/** What one desktop session's own record says (by its desktop id); a field is absent when the record has none. */
export interface DesktopSessionInfo {
  title?: string;
  /** The CLI session it runs: the id this app's own sessions are named by. */
  cliSessionId?: string;
  /** The folder it works in. */
  cwd?: string;
  isArchived?: boolean;
  lastActivityAt?: number;
  /** Whether the session's last turn ended on a question for the person. */
  awaitingPerson?: boolean;
}

/** The package's entry script, when an installed package has the desktop commands. */
async function desktopCommandsEntry(): Promise<string | null> {
  const [entry, version] = await Promise.all([resolveSessionMcpEntry(), getSessionMcpVersion()]);
  if (!entry || !version || isNewerVersion(DESKTOP_COMMANDS_SINCE, version)) return null;
  return entry;
}

/** What the package printed (its last line is the answer), or null when it failed or printed something else. */
async function runDesktopCommand(args: string[]): Promise<Record<string, unknown> | null> {
  const entry = await desktopCommandsEntry();
  if (!entry) return null;
  const result = await runLauncher(process.execPath, [entry, ...args], { timeout: COMMAND_TIMEOUT_MS, maxBuffer: COMMAND_MAX_BUFFER });
  return parseAnswer(result.stdout);
}

function parseAnswer(stdout: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(stdout.trim().split('\n').pop() ?? '');
    return parsed && typeof parsed === 'object' && (parsed as { ok?: unknown }).ok === true ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

function pairs(value: unknown): Array<[string, string]> {
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value as Record<string, unknown>).filter((e): e is [string, string] => typeof e[1] === 'string');
}

/** The package's `desktop-state` answer (also one line of `desktop-watch`) as maps and sets. */
export function parseDesktopState(answer: Record<string, unknown>): DesktopSessionState {
  return {
    starters: new Map(pairs(answer.starters)),
    archived: new Set(strings(answer.archived)),
    titles: new Map(pairs(answer.titles)),
    running: new Set(strings(answer.running)),
  };
}

/** What the desktop app records now, or nothing when the package cannot say. */
export async function readDesktopState(): Promise<DesktopSessionState> {
  const answer = await runDesktopCommand(['desktop-state']);
  return answer ? parseDesktopState(answer) : EMPTY_DESKTOP_STATE;
}

/** One desktop session's own record by its desktop id (`local_…`), or undefined when the package knows of none. */
export async function findDesktopSession(desktopSessionId: string): Promise<DesktopSessionInfo | undefined> {
  const answer = await runDesktopCommand(['desktop-session', desktopSessionId]);
  const session = answer?.session;
  return session && typeof session === 'object' ? (session as DesktopSessionInfo) : undefined;
}

/** Who started a session: the session's CLI id and the folder it works in; undefined when nothing says. */
export async function findStarter(sessionId: string): Promise<{ sessionId: string; cwd?: string } | undefined> {
  const answer = await runDesktopCommand(['started-by', sessionId]);
  if (!answer || typeof answer.startedBy !== 'string' || answer.startedBy === '') return undefined;
  return { sessionId: answer.startedBy, ...(typeof answer.cwd === 'string' && { cwd: answer.cwd }) };
}

/**
 * Call [onChange] when something in the desktop app's records moves (who is under whom, an archive, a title,
 * which sessions are running), with the state now and what moved. The package does the watching in its own
 * `desktop-watch` process, which prints one line per change and ends when this side closes its input.
 *
 * Returns the function that stops watching. When the package cannot do it (not installed, too old) nothing is
 * started and nothing is ever announced.
 */
export function watchDesktopState(onChange: (state: DesktopSessionState, change: DesktopChange) => void): () => void {
  let stopped = false;
  let child: ChildProcess | null = null;
  let restart: ReturnType<typeof setTimeout> | null = null;

  const start = async () => {
    const entry = await desktopCommandsEntry();
    if (stopped || !entry) return;
    child = spawn(process.execPath, [entry, 'desktop-watch'], { stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true });
    let pending = '';
    child.stdout?.on('data', (chunk: Buffer) => {
      pending += chunk.toString('utf8');
      let at: number;
      while ((at = pending.indexOf('\n')) !== -1) {
        const line = pending.slice(0, at);
        pending = pending.slice(at + 1);
        const answer = parseAnswer(line);
        const change = answer?.change as Partial<DesktopChange> | undefined;
        if (answer && change && !stopped) onChange(parseDesktopState(answer), { list: change.list === true, running: change.running === true });
      }
    });
    child.on('error', () => undefined);
    child.on('exit', () => {
      child = null;
      if (!stopped) restart = setTimeout(() => void start(), RESTART_AFTER_MS);
    });
  };
  void start();

  return () => {
    stopped = true;
    if (restart) clearTimeout(restart);
    // The package ends when its input closes; the signal is for one that does not notice.
    child?.stdin?.end();
    child?.kill();
  };
}
