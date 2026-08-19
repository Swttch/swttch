import { describe, it, expect } from 'vitest';
import { ascend, ascentBetween, readAscentFromUrl } from '../rootUpParam';

describe('ascend', () => {
  it('strips one segment per level', () => {
    expect(ascend('/repo/packages/battery', 1)).toBe('/repo/packages');
    expect(ascend('/repo/packages/battery', 2)).toBe('/repo');
  });

  it('returns the path untouched for zero levels', () => {
    expect(ascend('/repo/packages/battery', 0)).toBe('/repo/packages/battery');
  });

  it('stops at the filesystem root instead of emptying the path', () => {
    // Returning '' would read as "no project" downstream and bounce the user
    // to the project selector.
    expect(ascend('/repo', 1)).toBe('/repo');
    expect(ascend('/repo/packages', 99)).toBe('/repo');
  });
});

describe('readAscentFromUrl', () => {
  it('reads the level count', () => {
    expect(readAscentFromUrl('workingDir=%2Frepo&rootUp=2')).toBe(2);
  });

  it('treats an absent parameter as zero levels up', () => {
    expect(readAscentFromUrl('workingDir=%2Frepo')).toBe(0);
    expect(readAscentFromUrl('')).toBe(0);
  });

  it('falls back to zero for values that cannot be a level count', () => {
    // A hand-edited or truncated URL must land on the ordinary behaviour
    // rather than throwing or resolving somewhere unexpected.
    expect(readAscentFromUrl('rootUp=abc')).toBe(0);
    expect(readAscentFromUrl('rootUp=-3')).toBe(0);
    expect(readAscentFromUrl('rootUp=')).toBe(0);
  });
});

describe('ascentBetween', () => {
  it('counts the levels between a directory and its ancestor', () => {
    expect(ascentBetween('/repo/packages/battery', '/repo')).toBe(2);
    expect(ascentBetween('/repo/webview', '/repo')).toBe(1);
  });

  it('is zero when the two are the same directory', () => {
    expect(ascentBetween('/repo', '/repo')).toBe(0);
  });

  it('is zero when the candidate only shares a name prefix', () => {
    // `/repo-worktrees` is not inside `/repo`; counting it would produce a
    // number that ascends to somewhere entirely different.
    expect(ascentBetween('/repo-worktrees/issue-1', '/repo')).toBe(0);
  });

  it('round-trips with ascend', () => {
    const anchor = '/repo';
    const nested = '/repo/packages/battery';
    expect(ascend(nested, ascentBetween(nested, anchor))).toBe(anchor);
  });
});
