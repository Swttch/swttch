import { describe, it, expect } from 'vitest';
import { withRootDir } from '../routes';

const REPO = '/repo';
const NESTED = '/repo/packages/battery';

describe('withRootDir', () => {
  it('writes how far up the anchor sits, not the anchor path', () => {
    // The anchor is always an ancestor, so a hop count says the same thing as
    // a second absolute path in a fraction of the characters.
    expect(withRootDir('/sessions/abc', REPO, NESTED)).toBe('/sessions/abc?rootUp=2');
  });

  it('appends with & when the path already carries a query', () => {
    expect(withRootDir('/sessions/abc?workingDir=%2Frepo%2Fx', REPO, NESTED)).toBe(
      '/sessions/abc?workingDir=%2Frepo%2Fx&rootUp=2',
    );
  });

  it('counts a single level for a direct child', () => {
    expect(withRootDir('/sessions/abc', REPO, '/repo/webview')).toBe('/sessions/abc?rootUp=1');
  });

  it('stays out of the URL when the anchor and the directory coincide', () => {
    // Absent already MEANS zero levels up, so writing it would add a parameter
    // to every ordinary URL for no gain.
    expect(withRootDir('/sessions/abc', REPO, REPO)).toBe('/sessions/abc');
  });

  it('writes nothing when either side is missing', () => {
    expect(withRootDir('/sessions/abc', null, NESTED)).toBe('/sessions/abc');
    expect(withRootDir('/sessions/abc', REPO, null)).toBe('/sessions/abc');
  });

  it('writes nothing when the anchor is not an ancestor at all', () => {
    // `/repo-worktrees` shares a name prefix with `/repo` but sits outside it;
    // a hop count cannot express that, so the parameter must be left off
    // rather than emitting a number that would resolve somewhere wrong.
    expect(withRootDir('/sessions/abc', REPO, '/repo-worktrees/issue-1')).toBe('/sessions/abc');
    expect(withRootDir('/sessions/abc', REPO, '/elsewhere/x')).toBe('/sessions/abc');
  });
});
