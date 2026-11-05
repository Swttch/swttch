import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

/**
 * The title of the Claude Desktop session that started a session, for the "Started from …" line over
 * the first message.
 *
 * The CLI's transcript does not say which session started it, and Desktop keeps that in its own session files:
 * one `local_<id>.json` per Desktop session, under `claude-code-sessions/<account>/<organization>/`. The file of
 * the session in question names the CLI session it runs (`cliSessionId`) and the Desktop session that started it
 * (`spawnedFrom.sessionId`); the title is in the starter's own file. That is a Desktop-private layout, so every
 * step is read tolerantly: any file that is missing or does not look as expected ends in "no title", never an
 * error, and the line just leaves the title out.
 */

/** Where Claude Desktop keeps its session files on this machine. */
export function desktopSessionsRoot(): string {
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'Claude', 'claude-code-sessions');
  }
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming'), 'Claude', 'claude-code-sessions');
  }
  return path.join(process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), '.config'), 'Claude', 'claude-code-sessions');
}

async function listDirectories(dir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries.filter(entry => entry.isDirectory()).map(entry => path.join(dir, entry.name));
  } catch {
    return [];
  }
}

/** Every Desktop session file: `<root>/<account>/<organization>/local_*.json`. */
async function listSessionFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  for (const account of await listDirectories(root)) {
    for (const organization of await listDirectories(account)) {
      try {
        const names = await fs.readdir(organization);
        for (const name of names) {
          if (name.startsWith('local_') && name.endsWith('.json')) files.push(path.join(organization, name));
        }
      } catch {
        // An unreadable folder is one fewer place to look.
      }
    }
  }
  return files;
}

async function readJson(file: string): Promise<Record<string, unknown> | undefined> {
  try {
    const parsed: unknown = JSON.parse(await fs.readFile(file, 'utf8'));
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

/** What a Desktop session's own file says about it; every field is left out when the file has nothing usable. */
export interface DesktopSessionInfo {
  title?: string;
  /** The CLI session it runs: the id this app's own sessions are named by. */
  cliSessionId?: string;
  /** The folder it works in. */
  cwd?: string;
  isArchived?: boolean;
  lastActivityAt?: number;
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

/** The Desktop session `desktopSessionId` (`local_…`), read from its own file; undefined when there is no such file. */
export async function findDesktopSession(
  desktopSessionId: string,
  root: string = desktopSessionsRoot(),
): Promise<DesktopSessionInfo | undefined> {
  // The id names a file, so it must be nothing but a name.
  if (path.basename(desktopSessionId) !== desktopSessionId || !desktopSessionId.startsWith('local_')) return undefined;
  const file = (await listSessionFiles(root)).find(candidate => path.basename(candidate) === `${desktopSessionId}.json`);
  const session = file ? await readJson(file) : undefined;
  if (!session) return undefined;
  const title = text(session.title);
  const cliSessionId = text(session.cliSessionId);
  const cwd = text(session.cwd);
  return {
    ...(title !== undefined && { title }),
    ...(cliSessionId !== undefined && { cliSessionId }),
    ...(cwd !== undefined && { cwd }),
    ...(typeof session.isArchived === 'boolean' && { isArchived: session.isArchived }),
    ...(typeof session.lastActivityAt === 'number' && { lastActivityAt: session.lastActivityAt }),
  };
}

/** The title of the Desktop session `desktopSessionId`, or undefined when it has none. */
export async function findDesktopSessionTitle(
  desktopSessionId: string,
  root: string = desktopSessionsRoot(),
): Promise<string | undefined> {
  return (await findDesktopSession(desktopSessionId, root))?.title;
}

/**
 * The title of the Desktop session that started the CLI session `cliSessionId`, or undefined when Desktop did
 * not start it, its files are not here, or the starter has no title.
 */
export async function findDesktopParentSessionTitle(
  cliSessionId: string,
  root: string = desktopSessionsRoot(),
): Promise<string | undefined> {
  const files = await listSessionFiles(root);

  let parentId: string | undefined;
  for (const file of files) {
    // The files are large (they carry the connectors' tool lists) and almost none is the one asked for, so the
    // id is looked for in the raw text before anything is parsed.
    let raw: string;
    try {
      raw = await fs.readFile(file, 'utf8');
    } catch {
      continue;
    }
    if (!raw.includes(cliSessionId)) continue;
    let session: Record<string, unknown> | undefined;
    try {
      session = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (session.cliSessionId !== cliSessionId) continue;
    const spawnedFrom = session.spawnedFrom as { sessionId?: unknown } | undefined;
    if (typeof spawnedFrom?.sessionId === 'string') parentId = spawnedFrom.sessionId;
    break;
  }
  return parentId ? findDesktopSessionTitle(parentId, root) : undefined;
}
