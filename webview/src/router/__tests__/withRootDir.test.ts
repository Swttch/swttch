import { describe, it, expect } from 'vitest';
import { withRootDir } from '../routes';

const REPO = '/repo';
const NESTED = '/repo/packages/battery';

describe('withRootDir', () => {
  it('writes the anchor when it differs from the session’s directory', () => {
    expect(withRootDir('/sessions/abc', REPO, NESTED)).toBe(
      `/sessions/abc?rootDir=${encodeURIComponent(REPO)}`,
    );
  });

  it('appends with & when the path already carries a query', () => {
    expect(withRootDir('/sessions/abc?workingDir=%2Frepo%2Fx', REPO, NESTED)).toBe(
      `/sessions/abc?workingDir=%2Frepo%2Fx&rootDir=${encodeURIComponent(REPO)}`,
    );
  });

  it('stays out of the URL when the anchor and the directory coincide', () => {
    // Absent already MEANS "the two are the same", so writing it would add a
    // parameter to every ordinary URL for no gain.
    expect(withRootDir('/sessions/abc', REPO, REPO)).toBe('/sessions/abc');
  });

  it('writes nothing when there is no anchor', () => {
    expect(withRootDir('/sessions/abc', null, NESTED)).toBe('/sessions/abc');
  });

  it('encodes a path containing characters that would break the query', () => {
    expect(withRootDir('/sessions/abc', '/repo/a b&c', NESTED)).toBe(
      '/sessions/abc?rootDir=%2Frepo%2Fa%20b%26c',
    );
  });
});
