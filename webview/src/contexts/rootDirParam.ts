/**
 * The `rootDir` URL parameter — the directory the working-directory dropdown is
 * anchored to, and the scope sessions are listed for.
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
 * Absent from the URL is not "no root" — it is the common case where the two
 * coincide, so it resolves to `workingDir`. That resolution lives in
 * WorkingDirContext alone; nobody downstream re-derives it.
 */

export const ROOT_DIR_PARAM_KEY = 'rootDir';

/**
 * The anchor read straight off the URL, or undefined when the URL does not
 * carry one. Applies the same trailing-slash normalization as `workingDir`, so
 * the value matches the `projectPath` the backend indexes by.
 */
export function readRootDirFromUrl(): string | undefined {
  const raw = new URLSearchParams(window.location.search).get(ROOT_DIR_PARAM_KEY);
  if (!raw) return undefined;
  return raw.replace(/\/+$/, '') || raw;
}
