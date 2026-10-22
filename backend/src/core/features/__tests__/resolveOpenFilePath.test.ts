import { describe, it, expect } from 'vitest';
import { resolveOpenFilePath } from '../resolveOpenFilePath';

const only = (...present: string[]) => (p: string) => present.includes(p);

describe('resolveOpenFilePath', () => {
  it('turns a Git Bash drive path into the Windows path when only that one exists', () => {
    expect(
      resolveOpenFilePath('/c/Users/me/tmp/x.png', 'win32', only('C:/Users/me/tmp/x.png')),
    ).toBe('C:/Users/me/tmp/x.png');
  });

  it('upper-cases the drive letter', () => {
    expect(resolveOpenFilePath('/d/data/a.txt', 'win32', only('D:/data/a.txt'))).toBe('D:/data/a.txt');
  });

  it('keeps a path that exists as written, even if it looks like a Git Bash drive', () => {
    expect(
      resolveOpenFilePath('/c/Users/me/x.png', 'win32', only('/c/Users/me/x.png', 'C:/Users/me/x.png')),
    ).toBe('/c/Users/me/x.png');
  });

  it('returns the original path when the translated one does not exist either', () => {
    expect(resolveOpenFilePath('/c/nope/x.png', 'win32', only())).toBe('/c/nope/x.png');
  });

  it('never reads a Git Bash drive path off Windows', () => {
    expect(resolveOpenFilePath('/c/Users/me/x.png', 'darwin', only('C:/Users/me/x.png'))).toBe(
      '/c/Users/me/x.png',
    );
    expect(resolveOpenFilePath('/c/Users/me/x.png', 'linux', only('C:/Users/me/x.png'))).toBe(
      '/c/Users/me/x.png',
    );
  });

  it('leaves paths that are not a one-letter drive prefix alone', () => {
    expect(resolveOpenFilePath('/home/me/x.png', 'win32', only('H:/ome/me/x.png'))).toBe('/home/me/x.png');
    expect(resolveOpenFilePath('/c', 'win32', only('C:/'))).toBe('/c');
    expect(resolveOpenFilePath('C:/Users/me/x.png', 'win32', only())).toBe('C:/Users/me/x.png');
  });
});

describe('resolveOpenFilePath under WSL (Linux backend)', () => {
  it('turns a WSL UNC path into the Linux path inside the distro', () => {
    expect(
      resolveOpenFilePath('//wsl$/Ubuntu/home/me/proj/x.png', 'linux', only('/home/me/proj/x.png')),
    ).toBe('/home/me/proj/x.png');
    expect(
      resolveOpenFilePath('//wsl.localhost/Ubuntu/home/me/x.png', 'linux', only('/home/me/x.png')),
    ).toBe('/home/me/x.png');
  });

  it('turns a Windows drive path into its /mnt mount', () => {
    expect(
      resolveOpenFilePath('C:/Users/me/AppData/x.png', 'linux', only('/mnt/c/Users/me/AppData/x.png')),
    ).toBe('/mnt/c/Users/me/AppData/x.png');
    expect(
      resolveOpenFilePath('D:\\data\\x.png', 'linux', only('/mnt/d/data/x.png')),
    ).toBe('/mnt/d/data/x.png');
  });

  it('keeps the clicked path when the translated one is not there either', () => {
    expect(resolveOpenFilePath('C:/nope/x.png', 'linux', only())).toBe('C:/nope/x.png');
    expect(resolveOpenFilePath('//wsl$/Ubuntu/home/me/x.png', 'linux', only())).toBe('//wsl$/Ubuntu/home/me/x.png');
  });

  it('does not touch these spellings on macOS', () => {
    expect(resolveOpenFilePath('C:/Users/me/x.png', 'darwin', only('/mnt/c/Users/me/x.png'))).toBe(
      'C:/Users/me/x.png',
    );
  });
});
