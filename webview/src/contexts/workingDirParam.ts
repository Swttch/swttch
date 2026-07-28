/**
 * The `workingDir` URL parameter, isolated from the React context that consumes it.
 *
 * The bridge adapters need the active project to tell the backend which project an
 * `openFile` belongs to, so per-project settings apply (issue #7). They run outside
 * React and so cannot use `useWorkingDir` — and importing WorkingDirContext from an
 * adapter drags the whole context module (and its api/bridge imports) into a cycle
 * that breaks module init. Keeping the parameter name and the URL read here, with no
 * imports of its own, lets both sides share one definition safely.
 */

export const WORKING_DIR_PARAM_KEY = 'workingDir';

/**
 * The current working directory read straight off the URL, or undefined when there
 * is none (the project selector). Applies the same trailing-slash normalization the
 * provider does, so the value matches the `projectPath` the backend indexes by.
 */
export function readWorkingDirFromUrl(): string | undefined {
  const raw = new URLSearchParams(window.location.search).get(WORKING_DIR_PARAM_KEY);
  if (!raw) return undefined;
  return raw.replace(/\/+$/, '') || raw;
}
