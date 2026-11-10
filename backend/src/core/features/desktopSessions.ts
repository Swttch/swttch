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
 * `isArchived` in the same file says the session is archived there.
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
  return { starters, archived };
}

/** Forget the files read (a test, or a folder that changed under another name). */
export function resetDesktopSessionsCache(): void {
  readFiles.clear();
}

function sameState(a: DesktopSessionState, b: DesktopSessionState): boolean {
  if (a.starters.size !== b.starters.size || a.archived.size !== b.archived.size) return false;
  for (const [id, starter] of a.starters) if (b.starters.get(id) !== starter) return false;
  for (const id of a.archived) if (!b.archived.has(id)) return false;
  return true;
}

/**
 * Call [onChange] when who is under whom, or which sessions are archived, in the desktop app changes.
 *
 * The desktop app sends nothing, so the folder is watched and the files that
 * changed are read again. Edits to a title or an archive flag change the files
 * too and read to the same answer, which is not announced. Returns the function
 * that stops watching; a machine without the folder watches nothing.
 */
export function watchDesktopState(
  onChange: () => void,
  root: string = desktopSessionsRoot(),
  debounceMs = 400,
): () => void {
  let watcher: FSWatcher | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let known: DesktopSessionState | null = null;
  let stopped = false;

  const check = async () => {
    const now = await readDesktopState(root);
    const changed = known !== null && !sameState(known, now);
    known = now;
    if (changed && !stopped) onChange();
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
