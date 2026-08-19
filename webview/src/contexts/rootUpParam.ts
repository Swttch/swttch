/**
 * The `rootUp` URL parameter — how many levels above `workingDir` the anchor sits.
 *
 * `rootDir` and `workingDir` are two different questions that happen to share an
 * answer most of the time:
 *
 *   rootDir     where am I LOOKING FROM  (tree anchor, session scope)
 *   workingDir  where does THIS SESSION run (its cwd, file paths)
 *
 * Both are always in play. They only take different values when the user is
 * browsing a parent while working in a session nested under it, but consumers
 * are not expected to special-case that: read whichever one answers the
 * question you are asking and let the values be equal when they are equal.
 *
 * The anchor is always an ANCESTOR of the working directory, so carrying it as
 * a full second path would repeat most of the first one — percent-encoded, at
 * three bytes per separator. A hop count says the same thing in a few
 * characters and cannot drift out of sync with the path it is relative to.
 *
 * Absent from the URL is not "no anchor" — it is the common case where the two
 * coincide, i.e. zero levels up. That resolution lives in WorkingDirContext
 * alone; nobody downstream re-derives it.
 */

export const ROOT_UP_PARAM_KEY = 'rootUp';

/** Strip the last [levels] segments from [path]. Never past the root. */
export function ascend(path: string, levels: number): string {
  let result = path;
  for (let i = 0; i < levels; i++) {
    const idx = result.lastIndexOf('/');
    // Stop at the filesystem root rather than producing '' — an empty working
    // directory would read as "no project" further down.
    if (idx <= 0) return result;
    result = result.slice(0, idx);
  }
  return result;
}

/**
 * Levels to ascend, parsed from the URL. Zero for anything missing or
 * malformed, which lands on "the anchor is the working directory itself" —
 * the behaviour every URL without the parameter has always had.
 */
export function readAscentFromUrl(search: string): number {
  const raw = new URLSearchParams(search).get(ROOT_UP_PARAM_KEY);
  if (!raw) return 0;

  const levels = Number.parseInt(raw, 10);
  return Number.isFinite(levels) && levels > 0 ? levels : 0;
}

/**
 * How many levels [child] sits below [ancestor], or 0 when it is not below it
 * at all. Used to turn a resolved anchor back into the compact form.
 */
export function ascentBetween(child: string, ancestor: string): number {
  if (child === ancestor) return 0;
  if (!child.startsWith(ancestor + '/')) return 0;

  return child.slice(ancestor.length + 1).split('/').length;
}
