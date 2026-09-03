import { describe, it, expect } from 'vitest';
import {
  abbreviateHomeDir,
  isInsideWorkingDir,
  isSameWorkingDir,
  normalizeWorkingDirPath,
  parentWorkingDir,
  relativeWorkingDir,
  workingDirName,
  workingDirSegments,
} from '../working-dir-path';

describe('normalizeWorkingDirPath', () => {
  it('reads a Windows path the same as its forward-slash spelling', () => {
    expect(normalizeWorkingDirPath('C:\\Users\\me\\repo')).toBe('C:/Users/me/repo');
  });

  it('drops a trailing separator', () => {
    expect(normalizeWorkingDirPath('/a/b/')).toBe('/a/b');
    expect(normalizeWorkingDirPath('C:\\a\\b\\')).toBe('C:/a/b');
  });
});

describe('isInsideWorkingDir', () => {
  it('finds a nested working dir on a posix path', () => {
    expect(isInsideWorkingDir('/repo/packages/ui', '/repo')).toBe(true);
  });

  // The regression this helper exists for: the dropdown showed nothing nested
  // on Windows because `child.startsWith(parent + '/')` never fired.
  it('finds a nested working dir on a backslash path', () => {
    expect(isInsideWorkingDir('C:\\repo\\packages\\ui', 'C:\\repo')).toBe(true);
  });

  it('finds a nested working dir across mixed separators', () => {
    expect(isInsideWorkingDir('C:\\repo\\packages\\ui', 'C:/repo')).toBe(true);
  });

  it('does not fire on a shared name prefix', () => {
    expect(isInsideWorkingDir('/repo-worktrees/x', '/repo')).toBe(false);
    expect(isInsideWorkingDir('C:\\repo-worktrees\\x', 'C:\\repo')).toBe(false);
  });

  it('is false for the directory itself', () => {
    expect(isInsideWorkingDir('/repo', '/repo')).toBe(false);
  });

  it('is false for an empty parent', () => {
    expect(isInsideWorkingDir('/repo', '')).toBe(false);
  });

  it('folds case for Windows paths', () => {
    expect(isInsideWorkingDir('C:\\Repo\\Packages\\UI', 'C:\\repo')).toBe(true);
  });
});

describe('isSameWorkingDir', () => {
  it('matches the same directory spelled with either separator', () => {
    expect(isSameWorkingDir('C:\\repo\\ui', 'C:/repo/ui')).toBe(true);
  });

  it('ignores a trailing separator', () => {
    expect(isSameWorkingDir('/repo/ui/', '/repo/ui')).toBe(true);
  });

  it('separates genuinely different directories', () => {
    expect(isSameWorkingDir('/repo/ui', '/repo/api')).toBe(false);
  });

  // Windows file systems are case-insensitive, and the same directory can reach
  // us spelled either way from different sources.
  it('folds case for Windows paths', () => {
    expect(isSameWorkingDir('C:\\Repo\\UI', 'C:\\repo\\ui')).toBe(true);
    expect(isSameWorkingDir('C:\\Repo\\UI', 'C:/repo/ui')).toBe(true);
  });

  // On Linux these are two real, distinct directories.
  it('keeps case significant for posix paths', () => {
    expect(isSameWorkingDir('/repo/UI', '/repo/ui')).toBe(false);
  });
});

describe('workingDirName', () => {
  it('takes the last segment of a posix path', () => {
    expect(workingDirName('/repo/packages/ui')).toBe('ui');
  });

  it('takes the last segment of a backslash path', () => {
    expect(workingDirName('C:\\repo\\packages\\ui')).toBe('ui');
  });

  it('ignores a trailing separator', () => {
    expect(workingDirName('/repo/ui/')).toBe('ui');
  });
});

describe('workingDirSegments', () => {
  it('counts depth the same for both separator styles', () => {
    expect(workingDirSegments('/repo/packages/ui')).toHaveLength(3);
    expect(workingDirSegments('C:\\repo\\packages\\ui')).toHaveLength(4);
  });
});

describe('parentWorkingDir', () => {
  it('keeps the posix separator style', () => {
    expect(parentWorkingDir('/repo/packages/ui')).toBe('/repo/packages');
  });

  it('keeps the backslash separator style', () => {
    expect(parentWorkingDir('C:\\repo\\packages\\ui')).toBe('C:\\repo\\packages');
  });

  it('has no parent to report at the top', () => {
    expect(parentWorkingDir('/repo')).toBe('');
  });
});

describe('relativeWorkingDir', () => {
  it('trims the shared anchor off a posix path', () => {
    expect(relativeWorkingDir('/repo/packages/ui', '/repo')).toBe('packages/ui');
  });

  it('trims the shared anchor off a backslash path', () => {
    expect(relativeWorkingDir('C:\\repo\\packages\\ui', 'C:\\repo')).toBe('packages/ui');
  });

  it('returns null when the path is not nested under the anchor', () => {
    expect(relativeWorkingDir('/elsewhere/ui', '/repo')).toBeNull();
  });
});

describe('abbreviateHomeDir', () => {
  it('shortens the home prefix on a posix path', () => {
    expect(abbreviateHomeDir('/Users/me/Projects/app', '/Users/me')).toBe('~/Projects/app');
  });

  it('renders the home directory itself as a bare tilde', () => {
    expect(abbreviateHomeDir('/Users/me', '/Users/me')).toBe('~');
  });

  it('leaves a path outside the home directory alone', () => {
    expect(abbreviateHomeDir('/private/tmp/demo', '/Users/me')).toBe('/private/tmp/demo');
  });

  // A shared name prefix is not containment: /Users/me-backup is a different
  // directory from /Users/me and must keep its full path.
  it('does not shorten a sibling that merely shares the name prefix', () => {
    expect(abbreviateHomeDir('/Users/me-backup/app', '/Users/me')).toBe('/Users/me-backup/app');
  });

  it('keeps the backslash separator style on a Windows path', () => {
    expect(abbreviateHomeDir('C:\\Users\\me\\Projects\\app', 'C:\\Users\\me')).toBe(
      '~\\Projects\\app',
    );
  });

  it('matches a Windows home directory case-insensitively', () => {
    expect(abbreviateHomeDir('C:\\Users\\Me\\app', 'c:\\users\\me')).toBe('~\\app');
  });

  // The webview asks the backend for the home directory, and the answer can be
  // missing — during a tunnel handshake, or on an older backend. Showing the
  // full path is right; showing "~/..." against an unknown home would be a lie.
  it('leaves the path alone when no home directory is known', () => {
    expect(abbreviateHomeDir('/Users/me/Projects/app', null)).toBe('/Users/me/Projects/app');
    expect(abbreviateHomeDir('/Users/me/Projects/app', '')).toBe('/Users/me/Projects/app');
  });
});
