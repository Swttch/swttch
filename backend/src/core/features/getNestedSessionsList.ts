import { isInsideWorkingDir, isSameWorkingDir } from '../../shared';
import { getProjectsList } from './getProjectsList';
import { getSessionsList, type SessionListEntry } from './getSessionsList';

/** A session plus the working directory it actually belongs to. */
export type NestedSessionListEntry = SessionListEntry & {
  /**
   * The working directory this session was recorded under. Equal to the
   * requested root for the root's own sessions; a nested path for the rest.
   * The panel uses it both to label the row and to run the session in the
   * directory it came from rather than the one being browsed.
   */
  sessionDir: string;
};

/**
 * Sessions for [rootDir] plus every working directory nested under it.
 *
 * Reading a whole subtree costs one directory scan per working directory, so
 * the caller decides when it is worth it — this is only reached with the
 * "include nested sessions" setting on. The scans run concurrently but the
 * number of them is bounded by how many directories the user has actually
 * used, not by the size of the tree on disk.
 */
export async function getNestedSessionsList(rootDir: string): Promise<NestedSessionListEntry[]> {
  const projects = await getProjectsList();
  const nested = projects.map((p) => p.path).filter((p) => isInsideWorkingDir(p, rootDir));

  // Deduplicate: the root can also appear in the projects list, and on a
  // case-insensitive file system two entries can name the same directory with
  // different spellings — so identity is decided by isSameWorkingDir, not by
  // string equality in a Set.
  const uniqueDirs = [rootDir];
  for (const dir of nested) {
    if (!uniqueDirs.some((seen) => isSameWorkingDir(seen, dir))) uniqueDirs.push(dir);
  }

  const perDir = await Promise.all(
    uniqueDirs.map(async (dir) => {
      const sessions = await getSessionsList(dir);
      return sessions.map((s) => ({ ...s, sessionDir: dir }));
    }),
  );

  const all = perDir.flat();

  // Re-sort across directories; each getSessionsList only sorted its own slice.
  all.sort((a, b) => {
    const aTime = new Date(a.lastTimestamp ?? a.createdAt).getTime();
    const bTime = new Date(b.lastTimestamp ?? b.createdAt).getTime();
    return bTime - aTime;
  });

  return all;
}
