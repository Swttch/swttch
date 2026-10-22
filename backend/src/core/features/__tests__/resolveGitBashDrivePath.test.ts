import { describe, it, expect } from 'vitest';
import { resolveGitBashDrivePath } from '../resolveGitBashDrivePath';

const only = (...present: string[]) => (p: string) => present.includes(p);

describe('resolveGitBashDrivePath', () => {
  it('turns a Git Bash drive path into the Windows path when only that one exists', () => {
    expect(
      resolveGitBashDrivePath('/c/Users/me/tmp/x.png', 'win32', only('C:/Users/me/tmp/x.png')),
    ).toBe('C:/Users/me/tmp/x.png');
  });

  it('upper-cases the drive letter', () => {
    expect(resolveGitBashDrivePath('/d/data/a.txt', 'win32', only('D:/data/a.txt'))).toBe('D:/data/a.txt');
  });

  it('keeps a path that exists as written, even if it looks like a Git Bash drive', () => {
    expect(
      resolveGitBashDrivePath('/c/Users/me/x.png', 'win32', only('/c/Users/me/x.png', 'C:/Users/me/x.png')),
    ).toBe('/c/Users/me/x.png');
  });

  it('returns the original path when the translated one does not exist either', () => {
    expect(resolveGitBashDrivePath('/c/nope/x.png', 'win32', only())).toBe('/c/nope/x.png');
  });

  it('never translates off Windows', () => {
    expect(resolveGitBashDrivePath('/c/Users/me/x.png', 'darwin', only('C:/Users/me/x.png'))).toBe(
      '/c/Users/me/x.png',
    );
    expect(resolveGitBashDrivePath('/c/Users/me/x.png', 'linux', only('C:/Users/me/x.png'))).toBe(
      '/c/Users/me/x.png',
    );
  });

  it('leaves paths that are not a one-letter drive prefix alone', () => {
    expect(resolveGitBashDrivePath('/home/me/x.png', 'win32', only('H:/ome/me/x.png'))).toBe('/home/me/x.png');
    expect(resolveGitBashDrivePath('/c', 'win32', only('C:/'))).toBe('/c');
    expect(resolveGitBashDrivePath('C:/Users/me/x.png', 'win32', only())).toBe('C:/Users/me/x.png');
  });
});
