import { describe, expect, it } from 'vitest';
import { listsHold, sessionDirsWithOrigin } from '../sessionListScope';

/**
 * A screen shows a list of the sessions of one folder, with the folders under it when it is asked to.
 * News about a session is only for the screens whose list the session can be in.
 */
describe('sessionDirsWithOrigin', () => {
  it('gives a folder as it is', () => {
    expect(sessionDirsWithOrigin(['/repo/packages/ui'])).toEqual(['/repo/packages/ui']);
  });

  it('adds the repository a worktree the CLI made belongs to', () => {
    expect(sessionDirsWithOrigin(['/repo/.claude/worktrees/fix-1'])).toEqual([
      '/repo/.claude/worktrees/fix-1',
      '/repo',
    ]);
  });

  it('reads the same for a Windows path', () => {
    expect(sessionDirsWithOrigin(['C:\\repo\\.claude\\worktrees\\fix-1'])).toEqual([
      'C:\\repo\\.claude\\worktrees\\fix-1',
      'C:\\repo',
    ]);
  });

  it('does not take a folder that only looks like a worktree for one', () => {
    expect(sessionDirsWithOrigin(['/repo-worktrees/fix-1'])).toEqual(['/repo-worktrees/fix-1']);
  });
});

describe('listsHold', () => {
  const alone = { rootDir: '/repo', includeNested: false };
  const nested = { rootDir: '/repo', includeNested: true };

  it('holds a session of the folder itself, nested or not', () => {
    expect(listsHold(alone, ['/repo'])).toBe(true);
    expect(listsHold(nested, ['/repo'])).toBe(true);
  });

  it('holds a session of a folder below it only when it lists the folders below', () => {
    expect(listsHold(alone, ['/repo/packages/ui'])).toBe(false);
    expect(listsHold(nested, ['/repo/packages/ui'])).toBe(true);
  });

  it('does not hold a session of a folder beside it, whatever the names share', () => {
    expect(listsHold(nested, ['/repo-worktrees/fix-673'])).toBe(false);
    expect(listsHold(alone, ['/other'])).toBe(false);
  });

  it('holds a session that moved into a worktree the CLI made, even when it lists no folder below', () => {
    expect(listsHold(alone, ['/repo/.claude/worktrees/fix-1'])).toBe(true);
    expect(listsHold(nested, ['/repo/.claude/worktrees/fix-1'])).toBe(true);
  });

  it('does not hold a worktree of another repository', () => {
    expect(listsHold(alone, ['/other/.claude/worktrees/fix-1'])).toBe(false);
  });

  it('holds a session when any one of its folders is in the list', () => {
    expect(listsHold(alone, ['/somewhere', '/repo'])).toBe(true);
  });

  it('compares Windows paths the way the list does', () => {
    expect(listsHold({ rootDir: 'C:/Repo', includeNested: true }, ['c:\\repo\\sub'])).toBe(true);
  });
});
