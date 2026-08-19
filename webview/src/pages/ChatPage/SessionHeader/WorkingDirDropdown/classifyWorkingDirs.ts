export interface WorkingDirEntry {
  name: string;
  path: string;
  sessionCount: number;
  lastModified: string;
}

export interface ClassifiedWorkingDirs {
  ancestors: WorkingDirEntry[];
  current: WorkingDirEntry | null;
  /** Working directories that share the same direct parent as [current]. */
  siblings: WorkingDirEntry[];
  descendants: WorkingDirEntry[];
  /** IDE root pinned to the top of the ancestor stack (even with 0 sessions). */
  ideRootEntry: WorkingDirEntry | null;
  /**
   * True when [current] was synthesized as a fallback because the user picked
   * a folder via "Add new" but has not started a Claude session there yet —
   * i.e. it exists in the URL but is not yet a registered working directory.
   */
  currentIsDraft: boolean;
}

/**
 * Posix-style path containment without trailing-slash false positives.
 * `/a/foo` is NOT inside `/a/fo` even though `'/a/foo'.startsWith('/a/fo')`.
 */
function isInside(child: string, parent: string): boolean {
  if (child === parent) return false;
  return child.startsWith(parent + '/');
}

export function parentPathOf(path: string): string {
  const idx = path.lastIndexOf('/');
  return idx > 0 ? path.substring(0, idx) : '';
}

/**
 * Partition all known working directories (from getProjectsList) relative to
 * the [current] working directory, capped by [ideRoot] when present.
 *
 * - ancestors:   directories that contain [current], shallow → deep.
 * - current:     the entry matching [current] exactly, or null.
 * - siblings:    entries sharing [current]'s direct parent path (excluding
 *                [current] itself and the IDE root which is rendered as the
 *                anchor). This is what lets a user jump from `cli/` to
 *                `webview/` without first navigating up to the parent.
 * - descendants: every working dir nested under [current], at any depth.
 * - ideRootEntry: the IDE root entry, always surfaced so the user can jump
 *                home even when the IDE root itself never hosted a Claude
 *                session.
 */
export function classifyWorkingDirs(
  all: WorkingDirEntry[],
  current: string | null,
  ideRoot: string | null,
): ClassifiedWorkingDirs {
  if (!current) {
    return {
      ancestors: [],
      current: null,
      siblings: [],
      descendants: [],
      ideRootEntry: null,
      currentIsDraft: false,
    };
  }

  const ideRootEntry = ideRoot
    ? (all.find((e) => e.path === ideRoot) ?? {
        name: ideRoot.split('/').pop() || ideRoot,
        path: ideRoot,
        sessionCount: 0,
        lastModified: new Date(0).toISOString(),
      })
    : null;

  // Fall back to a synthesized entry when [current] has no Claude session yet
  // (e.g. the user just picked the folder via "Add new"). The dropdown should
  // still show the current row as selected and let siblings sit around it —
  // otherwise the user lands on a working dir that doesn't appear in its own
  // dropdown. The `currentIsDraft` flag downstream marks this row with a
  // "Draft" badge so the user knows the WD only persists once a session runs.
  const foundCurrent = all.find((e) => e.path === current);
  const currentIsDraft = !foundCurrent;
  const currentEntry =
    foundCurrent ?? {
      name: current.split('/').pop() || current,
      path: current,
      sessionCount: 0,
      lastModified: new Date(0).toISOString(),
    };

  const ancestors = all
    .filter((e) => isInside(current, e.path))
    .filter((e) => (ideRoot ? e.path === ideRoot || isInside(e.path, ideRoot) : true))
    // IDE root is rendered separately as the anchor — exclude here to dedupe.
    .filter((e) => !ideRoot || e.path !== ideRoot)
    .sort((a, b) => a.path.length - b.path.length);

  // Sibling working directories share a common PARENT working directory —
  // not just a common OS directory. If the shared OS parent is not a
  // registered working dir (= the user never ran claude there), the entries
  // sitting next to each other are not "siblings" in our domain, they're just
  // two unrelated working dirs that happen to live under the same folder.
  const currentParent = parentPathOf(current);
  const parentIsWorkingDir = !!currentParent && all.some((e) => e.path === currentParent);
  const siblings = parentIsWorkingDir
    ? all
        .filter((e) => e.path !== current && parentPathOf(e.path) === currentParent)
        // Suppress the IDE root from sibling slot — it's already the anchor.
        .filter((e) => !ideRoot || e.path !== ideRoot)
        .sort((a, b) => a.path.localeCompare(b.path))
    : [];

  // Every working dir nested under [current], at any depth — not just direct
  // children. A monorepo keeps its sub-projects at `packages/<name>`, so a
  // one-level cut hides exactly the entries the user is most likely to switch
  // to. The menu reconstructs the intermediate folders as non-clickable rows.
  const descendants = all
    .filter((e) => isInside(e.path, current))
    .sort((a, b) => a.path.localeCompare(b.path));

  return {
    ancestors,
    current: currentEntry,
    siblings,
    descendants,
    ideRootEntry,
    currentIsDraft,
  };
}
