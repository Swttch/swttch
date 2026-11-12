import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { getGlobalPackageInstallation, resetGlobalPackageRoots } from './extend-kit';
import { SESSION_MCP_PACKAGE } from './global-install-target';
import { readMergedSettings } from './features/settings';

/**
 * Locates the user's global @swttch/session-manager-mcp install.
 *
 * Like the extend kit, this package is never imported by the backend, statically or
 * dynamically. The backend only learns WHERE its entry script is, and the Claude CLI runs that
 * script itself as a stdio MCP server (`--mcp-config`). The lookup is the extend kit's, asked
 * through the one executable this package provides.
 */
export { SESSION_MCP_PACKAGE };

/** The executable the package provides, which is how volta and `which` know it. */
export const SESSION_MCP_BINARY = 'swttch-session-manager-mcp';

/**
 * The areas the server can serve, one server per area (`--area <name>`). Each area exposes its
 * own group of tools, so the model sees `mcp__swttch_<area>__<tool>` and a user can pay the
 * context cost of only the groups they want.
 */
export const SESSION_MCP_AREAS = [
  'session_mgmt',
  'session',
  'sidebar',
  'window',
  'view',
  'host',
  'pr',
  'settings',
  'directory',
  'connectors',
  'turn',
] as const;

/**
 * What an install attaches: the two areas a person installs this for. `session_mgmt` works with
 * the sessions that exist (find, message, stop, archive) and `session` starts new ones. Without
 * `session` the model has no tool to start a session and runs a subagent in its place.
 */
export const DEFAULT_SESSION_MCP_AREAS: readonly string[] = ['session_mgmt', 'session'];

export interface SessionMcpSettings {
  enabled: boolean;
  areas: string[];
}

/**
 * The `sessionMcp` setting as the launcher uses it. Installing the package is what turns it on, so
 * only an explicit `enabled: false` in a settings file turns it off. Names that are not areas this
 * build knows are dropped, so a typo in the file cannot put an arbitrary string on the CLI's
 * command line.
 */
export function normalizeSessionMcpSettings(raw: unknown): SessionMcpSettings {
  const value = (raw && typeof raw === 'object' ? raw : {}) as { enabled?: unknown; areas?: unknown };
  const known = new Set<string>(SESSION_MCP_AREAS);
  const requested = Array.isArray(value.areas) ? value.areas : [...DEFAULT_SESSION_MCP_AREAS];
  const areas = SESSION_MCP_AREAS.filter((area) => requested.includes(area) && known.has(area));
  return { enabled: value.enabled !== false, areas };
}

let cachedEntry: string | null | undefined;

export function getSessionMcpInstallation(): Promise<{ root: string; version: string } | null> {
  return getGlobalPackageInstallation(SESSION_MCP_PACKAGE, SESSION_MCP_BINARY);
}

export async function getSessionMcpVersion(): Promise<string | null> {
  return (await getSessionMcpInstallation())?.version ?? null;
}

/**
 * Absolute path of the server's entry script, taken from the installed package's own
 * `bin` entry rather than a hardcoded file name. Null when the package is not installed or its
 * manifest names no usable entry.
 */
export async function resolveSessionMcpEntry(): Promise<string | null> {
  if (cachedEntry !== undefined) {
    // A package removed in a terminal is not announced to this backend either. The remembered
    // script is checked each time it is handed out: a path that is gone would otherwise be
    // given to the CLI as a server that cannot start, and the session list would go on drawing
    // what the package draws.
    if (cachedEntry === null || existsSync(cachedEntry)) return cachedEntry;
    resetSessionMcpCache();
  }
  const install = await getSessionMcpInstallation();
  if (!install) return null; // not cached: an install a moment later must be seen
  const packageDir = join(install.root, ...SESSION_MCP_PACKAGE.split('/'));
  let entry: string | null = null;
  try {
    const manifest = JSON.parse(await readFile(join(packageDir, 'package.json'), 'utf8')) as {
      bin?: string | Record<string, string>;
    };
    const relative = typeof manifest.bin === 'string' ? manifest.bin : manifest.bin?.[SESSION_MCP_BINARY];
    const candidate = relative ? join(packageDir, relative) : null;
    entry = candidate && existsSync(candidate) ? candidate : null;
  } catch {
    entry = null;
  }
  cachedEntry = entry;
  return entry;
}

/** Forget where the server was found, so an install, update or removal is seen without a restart. */
export function resetSessionMcpCache(): void {
  cachedEntry = undefined;
  resetGlobalPackageRoots(SESSION_MCP_BINARY);
}

export interface InstalledSessionMcp {
  /** Absolute path of the server's entry script. */
  entry: string;
  /** Areas to start, already filtered to the ones this build knows. */
  areas: string[];
}

/**
 * What to attach to the CLI being started for `workingDir`: the entry script and the chosen
 * areas, or null when the package is not installed, a settings file turns it off, or no area is left.
 * Nothing is installed here; a missing package simply means no extra argument.
 */
export async function resolveInstalledSessionMcp(workingDir?: string): Promise<InstalledSessionMcp | null> {
  const { settings } = await readMergedSettings(workingDir);
  const { enabled, areas } = normalizeSessionMcpSettings(settings.sessionMcp);
  if (!enabled || areas.length === 0) return null;
  const entry = await resolveSessionMcpEntry();
  if (!entry) lookAgainAfterMiss();
  return entry ? { entry, areas } : null;
}

/**
 * Whether the package is on this machine, for the screens that only exist with it (a session
 * drawn under the one that started it, in the session list).
 *
 * Asked on every list request, so it must stay cheap: a found package is one file check, and a
 * missing one asks for the slow fresh look behind the request, at most once a minute, the same
 * way a Claude start does. A package installed in a terminal therefore shows up within a minute.
 */
export async function isSessionMcpInstalled(): Promise<boolean> {
  // A developer running the server from a checkout names it with this variable.
  if (process.env.SWTTCH_SESSION_MCP_BIN) return true;
  const entry = await resolveSessionMcpEntry();
  if (!entry) lookAgainAfterMiss();
  return entry !== null;
}

/** How often a start that found no package may ask for a fresh look. */
const MISS_RECHECK_INTERVAL_MS = 60_000;
let lastMissRecheckAt = 0;

/**
 * A package installed in a terminal is not announced to this backend, and where global packages
 * live is remembered from the last look, so without this the package would stay unseen until the
 * About screen is opened or the backend restarts.
 *
 * The fresh look runs the package managers, which is too slow to make a Claude start wait for when
 * the usual answer is still "not installed". So it runs behind the start that missed, at most once
 * a minute, and the starts after it see the package.
 */
function lookAgainAfterMiss(): void {
  const now = Date.now();
  if (now - lastMissRecheckAt < MISS_RECHECK_INTERVAL_MS) return;
  lastMissRecheckAt = now;
  resetSessionMcpCache();
  void resolveSessionMcpEntry().catch(() => null);
}
