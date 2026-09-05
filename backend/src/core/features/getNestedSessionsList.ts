import { isInsideWorkingDir, isSameWorkingDir } from '../../shared';
import { getProjectsList } from './getProjectsList';
import {
  collectSortKeys,
  resolvePage,
  type SessionListOptions,
  type SessionListPage,
} from './getSessionsList';

/**
 * Sessions for [rootDir] plus every working directory nested under it.
 *
 * Reading a whole subtree costs one directory scan per working directory, so
 * the caller decides when it is worth it — this is only reached with the
 * "include nested sessions" setting on. The scans run concurrently but the
 * number of them is bounded by how many directories the user has actually
 * used, not by the size of the tree on disk.
 *
 * Ordering is settled across ALL directories before any transcript is opened,
 * which is what lets a page be the globally newest N rather than the newest N
 * of whichever directory happened to be read first.
 */
export async function getNestedSessionsList(
  rootDir: string,
  options: SessionListOptions = {},
): Promise<SessionListPage> {
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

  const perDir = await Promise.all(uniqueDirs.map((dir) => collectSortKeys(dir, dir)));
  const allKeys = perDir.flat();
  allKeys.sort((a, b) => b.sortedAt - a.sortedAt);

  // Every row already states the directory it belongs to: resolvePage carries
  // it over from the sort key, so nothing here has to match rows back to the
  // request that produced them.
  return resolvePage(allKeys, options);
}
