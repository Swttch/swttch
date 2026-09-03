/**
 * Path helpers for reasoning about working directories as a tree.
 *
 * Working-directory paths reach us as the CLI recorded them (the `cwd` in a
 * JSONL entry / `projectPath` in sessions-index.json), so on Windows they can
 * arrive backslash-separated. Every comparison below therefore runs on a
 * normalized form rather than on the raw string — a containment check written
 * as `child.startsWith(parent + '/')` silently reports "not nested" for
 * `C:\repo\packages\ui` under `C:\repo`, which is exactly the monorepo case the
 * dropdown exists to show.
 *
 * `backend/src/bridge/rpc-routing.ts` already normalizes this way for RPC
 * routing; these helpers apply the same rule to the working-dir tree so the two
 * cannot disagree about whether one directory sits inside another.
 */

/**
 * Separator-agnostic form used for comparison only: backslashes become forward
 * slashes and trailing slashes are dropped. Never render this to the user —
 * it is a comparison key, not a display path.
 */
export function normalizeWorkingDirPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/, '');
}

/**
 * Whether [path] came from a Windows host, judged from the path itself rather
 * than from the running process. These helpers run in both the Node backend and
 * the browser webview, and the webview may be a browser on one OS driving a
 * backend on another (a tunnel session) — so the host we are executing on says
 * nothing about the paths we are comparing. A drive letter or a backslash does.
 */
function isWindowsPath(path: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(path) || path.includes('\\');
}

/**
 * Comparison keys for a pair of paths: normalized, and case-folded when either
 * side looks like Windows. Windows file systems are case-insensitive, so
 * `C:\Repo` and `C:\repo` are one directory. Posix paths are left cased — on
 * Linux they are genuinely distinct, and folding them would merge two real
 * directories into one row.
 *
 * The decision is made for the pair rather than per path, because the same
 * directory can reach us spelled `C:\repo` from one source and `C:/repo` from
 * another; folding only the backslash spelling would make them stop matching.
 */
function comparisonKeys(a: string, b: string): [string, string] {
  const na = normalizeWorkingDirPath(a);
  const nb = normalizeWorkingDirPath(b);
  if (isWindowsPath(a) || isWindowsPath(b)) return [na.toLowerCase(), nb.toLowerCase()];
  return [na, nb];
}

/** True when [a] and [b] name the same directory, separators aside. */
export function isSameWorkingDir(a: string, b: string): boolean {
  const [ka, kb] = comparisonKeys(a, b);
  return ka === kb;
}

/**
 * True when [child] sits strictly below [parent], compared at segment
 * boundaries so a shared name prefix does not count: `/repo-worktrees` is NOT
 * inside `/repo`, even though the string starts with it.
 */
export function isInsideWorkingDir(child: string, parent: string): boolean {
  const [c, p] = comparisonKeys(child, parent);
  if (p === '' || c === p) return false;
  return c.startsWith(p + '/');
}

/** Path segments of [path], separators aside. Empty segments are dropped. */
export function workingDirSegments(path: string): string[] {
  return normalizeWorkingDirPath(path).split('/').filter(Boolean);
}

/** Last segment of [path] — the folder's own name — or [path] if it has none. */
export function workingDirName(path: string): string {
  const segments = workingDirSegments(path);
  return segments[segments.length - 1] ?? path;
}

/**
 * The containing directory of [path], preserving the separator style of the
 * input so the result stays usable as a real path. Returns '' when [path] has
 * no parent to speak of.
 */
export function parentWorkingDir(path: string): string {
  const separator = path.includes('\\') && !path.includes('/') ? '\\' : '/';
  const idx = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  if (idx <= 0) return '';
  return path.slice(0, idx).replace(/[/\\]+$/, '') || separator;
}

/**
 * [child] expressed relative to [ancestor], separators aside. Returns null when
 * [child] is not actually nested under [ancestor].
 */
export function relativeWorkingDir(child: string, ancestor: string): string | null {
  if (!isInsideWorkingDir(child, ancestor)) return null;
  const trimmed = normalizeWorkingDirPath(child);
  const prefixLength = normalizeWorkingDirPath(ancestor).length;
  return trimmed.slice(prefixLength + 1);
}

/**
 * [path] with the home directory shortened to `~`, for display only.
 *
 * In a list of working directories the home prefix is the part every row
 * shares, so it is the least informative run of characters on screen while
 * taking the most room — and it is the tail, the part that actually tells two
 * `proj2` entries apart, that gets dropped when a row runs out of width.
 *
 * [homeDir] has to be supplied by whoever knows it. The webview cannot read it:
 * in a tunnel session the browser and the backend are different machines, so
 * the home directory of the machine rendering this is not the one these paths
 * were recorded on.
 *
 * Returns [path] untouched when it does not sit under [homeDir], and keeps the
 * input's separator style so a Windows path stays backslash-separated.
 */
export function abbreviateHomeDir(path: string, homeDir: string | null | undefined): string {
  if (!homeDir) return path;
  if (isSameWorkingDir(path, homeDir)) return '~';

  const relative = relativeWorkingDir(path, homeDir);
  if (relative === null) return path;

  const separator = path.includes('\\') && !path.includes('/') ? '\\' : '/';
  return `~${separator}${relative.split('/').join(separator)}`;
}
