import { describe, it, expect } from 'vitest';
import { getSessionOriginLabel } from '../utils';

const ROOT = '/repo';

describe('getSessionOriginLabel', () => {
  it('stays silent for sessions from the directory being browsed', () => {
    expect(getSessionOriginLabel(ROOT, ROOT)).toBeUndefined();
  });

  it('names a nested session by its path relative to the anchor', () => {
    expect(getSessionOriginLabel(`${ROOT}/packages/battery`, ROOT)).toBe('packages/battery');
  });

  it('does not trim a sibling that merely shares the name prefix', () => {
    // `/repo-worktrees` starts with the anchor as a string but is not inside
    // it. Slicing by length would leave the nonsense label `worktrees/issue-1`,
    // pointing at a path that does not exist.
    expect(getSessionOriginLabel('/repo-worktrees/issue-1', ROOT)).toBe('/repo-worktrees/issue-1');
  });

  it('falls back to the full path for a session outside the anchor', () => {
    expect(getSessionOriginLabel('/elsewhere/project', ROOT)).toBe('/elsewhere/project');
  });

  it('stays silent when either side is missing', () => {
    expect(getSessionOriginLabel(undefined, ROOT)).toBeUndefined();
    expect(getSessionOriginLabel(`${ROOT}/webview`, null)).toBeUndefined();
  });
});
