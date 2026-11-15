import { isInsideWorkingDir, isSameWorkingDir } from '../../shared';

/**
 * What a screen's list is made of: the sessions of [rootDir], and when [includeNested] is on, of the
 * folders under it. The same two things the list is asked for (GET_SESSIONS).
 */
export interface ListScope {
  rootDir: string;
  includeNested: boolean;
}

/**
 * A repository's worktrees made by the CLI (`claude -w`, the EnterWorktree tool) are kept under
 * `<repository>/.claude/worktrees/<name>`, in either kind of separator.
 */
const WORKTREE_OF_REPOSITORY = /^(.*?)[\\/]\.claude[\\/]worktrees[\\/][^\\/]+/;

/**
 * The folders to look for a session in: the ones given, and for a worktree the CLI made, the
 * repository it belongs to.
 *
 * A session that moves into such a worktree has its transcript filed under the worktree, and the
 * list shows it under the folder it was opened in as well (#658), which a list that does not
 * include the folders below would otherwise leave out. The repository is read off the path, so no
 * transcript is opened for it.
 */
export function sessionDirsWithOrigin(dirs: string[]): string[] {
  const all = [...dirs];
  for (const dir of dirs) {
    const repository = WORKTREE_OF_REPOSITORY.exec(dir)?.[1];
    if (repository && !all.some((seen) => isSameWorkingDir(seen, repository))) all.push(repository);
  }
  return all;
}

/**
 * Whether the list described by [scope] can hold a session that lives in any of [sessionDirs], by the
 * rule the list is made by: its own folder, the folders below it when it lists them, and the
 * repository of a worktree the CLI made.
 *
 * It says whether the session can be in the list, not whether it is on the page now; a session on a
 * later page is in the list.
 */
export function listsHold(scope: ListScope, sessionDirs: string[]): boolean {
  return sessionDirsWithOrigin(sessionDirs).some(
    (dir) =>
      isSameWorkingDir(dir, scope.rootDir) || (scope.includeNested && isInsideWorkingDir(dir, scope.rootDir)),
  );
}
