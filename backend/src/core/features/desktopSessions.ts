import { watch, type FSWatcher } from 'fs';
import { readdir, readFile, stat } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';

/**
 * Who started whom in the Claude desktop app.
 *
 * The desktop app keeps one JSON file per session under its own data folder
 * (`claude-code-sessions/<account>/<workspace>/local_<id>.json`). A session that
 * another session started names that session in `spawnedFrom.sessionId`, in the
 * desktop app's own id (`local_…`). The same file holds `cliSessionId`, the id
 * the CLI gave the session, which is the id every list here is keyed by.
 *
 * `spawnedFrom` is only who created the session. A session taken to the top level in the
 * desktop app (by the user, or by Claude) stays marked as spawned and carries
 * `lineageDetached: true` besides, and the desktop app draws it as a top-level
 * session. Reading `spawnedFrom` alone put such a session under the one that
 * created it, which the desktop app does not.
 *
 * `isArchived` in the same file says the session is archived there. `title` is the name the
 * desktop app shows for it.
 *
 * Whether a turn is running in the desktop app is not a field of its own. The file records
 * when the last user message arrived (`latestUserFrameAt`) and when the last turn ended
 * (`lastTurnEdgeAt`): a user message newer than the last end is a turn still going. A turn
 * that was cut off without ever ending would look running for good, so a session that has
 * written nothing for [RUNNING_FRESH_MS] is not counted as running.
 *
 * The folder belongs to the desktop app and is only read, never written. Its
 * shape is not a contract: a file that cannot be read, or one without the
 * fields, is skipped, and a machine without the app has no such folder and an
 * empty answer.
 */

/** The desktop app's session folder on this machine. */
export function desktopSessionsRoot(): string {
  if (process.platform === 'darwin') return join(homedir(), 'Library', 'Application Support', 'Claude', 'claude-code-sessions');
  if (process.platform === 'win32') {
    return join(process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'), 'Claude', 'claude-code-sessions');
  }
  return join(process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'), 'Claude', 'claude-code-sessions');
}

/** A session with a user message newer than its last turn end, and no activity for this long, is taken as no longer running. */
export const RUNNING_FRESH_MS = 30 * 60 * 1000;

interface DesktopSessionFile {
  mtimeMs: number;
  /** The desktop app's id of the session (`local_…`), and the CLI's. */
  localId: string | null;
  cliSessionId: string | null;
  /** The desktop app's id of the session that created it. */
  spawnedFromId: string | null;
  /** Taken to the top level in the desktop app, which makes `spawnedFrom` no longer its place in a tree. */
  lineageDetached: boolean;
  isArchived: boolean;
  title: string | null;
  /** A user message newer than the last turn end: a turn is in flight (before the staleness check). */
  turnOpen: boolean;
  lastActivityAt: number;
}

/** Files already read, by path, so that a refresh reads only the files that changed. */
const readFiles = new Map<string, DesktopSessionFile>();

/** The session files under [root]: `<account>/<workspace>/local_*.json`, looked for down to a few levels. */
async function sessionFilesUnder(root: string, depth = 0): Promise<string[]> {
  let names: import('fs').Dirent[];
  try {
    names = await readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const files: string[] = [];
  for (const entry of names) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      if (depth < 3) files.push(...(await sessionFilesUnder(path, depth + 1)));
    } else if (/^local_.+\.json$/.test(entry.name)) {
      files.push(path);
    }
  }
  return files;
}

async function readSessionFile(path: string): Promise<DesktopSessionFile | null> {
  try {
    const { mtimeMs } = await stat(path);
    const cached = readFiles.get(path);
    if (cached && cached.mtimeMs === mtimeMs) return cached;
    const parsed = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>;
    const spawnedFrom = parsed.spawnedFrom as { sessionId?: unknown } | null | undefined;
    const read: DesktopSessionFile = {
      mtimeMs,
      localId: typeof parsed.sessionId === 'string' ? parsed.sessionId : null,
      cliSessionId: typeof parsed.cliSessionId === 'string' && parsed.cliSessionId !== '' ? parsed.cliSessionId : null,
      spawnedFromId: typeof spawnedFrom?.sessionId === 'string' ? spawnedFrom.sessionId : null,
      lineageDetached: parsed.lineageDetached === true,
      isArchived: parsed.isArchived === true,
      title: typeof parsed.title === 'string' && parsed.title !== '' ? parsed.title : null,
      turnOpen:
        typeof parsed.latestUserFrameAt === 'number' &&
        (typeof parsed.lastTurnEdgeAt !== 'number' || parsed.latestUserFrameAt > parsed.lastTurnEdgeAt),
      lastActivityAt: typeof parsed.lastActivityAt === 'number' ? parsed.lastActivityAt : 0,
    };
    readFiles.set(path, read);
    return read;
  } catch {
    // Written while being read, or not a session file: the next read will see it whole.
    return null;
  }
}

/** What the desktop app records about its sessions, by the CLI id of each. */
export interface DesktopSessionState {
  /** For every session the desktop app draws under another one: the CLI id of the session, to the CLI id of the one it is under. */
  starters: Map<string, string>;
  /** The sessions archived in the desktop app. */
  archived: Set<string>;
  /** The title the desktop app shows for each session, by the CLI id. */
  titles: Map<string, string>;
  /** The sessions with a turn in flight in the desktop app. */
  running: Set<string>;
}

/**
 * For every session the desktop app draws under another one: the CLI id of the
 * session, to the CLI id of the one that started it. A pair is left out when
 * either side has no CLI id (a session that never ran).
 */
export async function readDesktopStarters(root: string = desktopSessionsRoot()): Promise<Map<string, string>> {
  return (await readDesktopState(root)).starters;
}

/** Who is under whom, and which sessions are archived, in the desktop app. */
export async function readDesktopState(root: string = desktopSessionsRoot()): Promise<DesktopSessionState> {
  const paths = await sessionFilesUnder(root);
  const files = (await Promise.all(paths.map(readSessionFile))).filter((f): f is DesktopSessionFile => f !== null);
  const cliByLocal = new Map<string, string>();
  for (const file of files) {
    if (file.localId && file.cliSessionId) cliByLocal.set(file.localId, file.cliSessionId);
  }
  const starters = new Map<string, string>();
  for (const file of files) {
    if (!file.cliSessionId || !file.spawnedFromId || file.lineageDetached) continue;
    const starter = cliByLocal.get(file.spawnedFromId);
    if (starter && starter !== file.cliSessionId) starters.set(file.cliSessionId, starter);
  }
  const archived = new Set<string>();
  for (const file of files) {
    if (file.cliSessionId && file.isArchived) archived.add(file.cliSessionId);
  }
  const titles = new Map<string, string>();
  const running = new Set<string>();
  const now = Date.now();
  for (const file of files) {
    if (!file.cliSessionId) continue;
    if (file.title) titles.set(file.cliSessionId, file.title);
    if (file.turnOpen && now - file.lastActivityAt < RUNNING_FRESH_MS) running.add(file.cliSessionId);
  }
  return { starters, archived, titles, running };
}

/** Forget the files read (a test, or a folder that changed under another name). */
export function resetDesktopSessionsCache(): void {
  readFiles.clear();
}

/** Whether what the session list draws (who is under whom, what is archived, the titles) is the same. */
function sameListState(a: DesktopSessionState, b: DesktopSessionState): boolean {
  if (a.starters.size !== b.starters.size || a.archived.size !== b.archived.size || a.titles.size !== b.titles.size) {
    return false;
  }
  for (const [id, starter] of a.starters) if (b.starters.get(id) !== starter) return false;
  for (const id of a.archived) if (!b.archived.has(id)) return false;
  for (const [id, title] of a.titles) if (b.titles.get(id) !== title) return false;
  return true;
}

function sameRunning(a: DesktopSessionState, b: DesktopSessionState): boolean {
  if (a.running.size !== b.running.size) return false;
  for (const id of a.running) if (!b.running.has(id)) return false;
  return true;
}

/** What moved in the desktop app since the last look. */
export interface DesktopChange {
  /** Who is under whom, what is archived, or a title: the session list has to be read again. */
  list: boolean;
  /** Which sessions have a turn in flight. */
  running: boolean;
}

/**
 * Call [onChange] when who is under whom, which sessions are archived, a title, or which
 * sessions are running, in the desktop app changes, with the state now and what moved.
 *
 * The desktop app sends nothing, so the folder is watched and the files that
 * changed are read again. A write that reads to the same answer is not announced.
 * Returns the function that stops watching; a machine without the folder watches nothing.
 */
export function watchDesktopState(
  onChange: (state: DesktopSessionState, change: DesktopChange) => void,
  root: string = desktopSessionsRoot(),
  debounceMs = 400,
): () => void {
  let watcher: FSWatcher | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let known: DesktopSessionState | null = null;
  let stopped = false;

  const check = async () => {
    const now = await readDesktopState(root);
    const before = known;
    known = now;
    if (stopped) return;
    // The first read has nothing to compare with, but a turn already running is news to every screen.
    const change: DesktopChange = {
      list: before !== null && !sameListState(before, now),
      running: before === null ? now.running.size > 0 : !sameRunning(before, now),
    };
    if (change.list || change.running) onChange(now, change);
  };
  void check();

  try {
    watcher = watch(root, { recursive: true, persistent: false }, () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void check(), debounceMs);
    });
    watcher.on('error', () => watcher?.close());
  } catch {
    // No such folder (the desktop app is not installed), or this platform cannot watch a tree.
  }

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    watcher?.close();
  };
}
