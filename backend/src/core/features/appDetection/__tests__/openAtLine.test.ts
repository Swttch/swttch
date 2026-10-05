import { describe, it, expect } from 'vitest';
import { resolveOpenAtLine, canOpenAtLine } from '../openAtLine';

const noPlist = async () => undefined;
const plist = (name: string) => async () => name;

describe('resolveOpenAtLine (#508)', () => {
  it('asks a VS Code family editor through its URL scheme', async () => {
    expect(await resolveOpenAtLine('cursor', '/Applications/Cursor.app', '/repo/src/a.ts', 42, undefined, 'darwin', noPlist))
      .toEqual({ kind: 'url', url: 'cursor://file/repo/src/a.ts:42' });
    expect(await resolveOpenAtLine('vscode', '/usr/bin/code', '/repo/a.ts', 7, 3, 'linux', noPlist))
      .toEqual({ kind: 'url', url: 'vscode://file/repo/a.ts:7:3' });
  });

  it('percent-encodes the path but keeps a drive colon, with a leading slash on Windows', async () => {
    expect(await resolveOpenAtLine('vscode', 'C:\\Code\\Code.exe', 'C:\\my repo\\a b.ts', 5, undefined, 'win32', noPlist))
      .toEqual({ kind: 'url', url: 'vscode://file/C:/my%20repo/a%20b.ts:5' });
  });

  it('runs a JetBrains launcher with --line, reading the executable name inside the macOS bundle', async () => {
    expect(await resolveOpenAtLine('webstorm', '/Applications/WebStorm.app', '/repo/a.ts', 10, 4, 'darwin', plist('webstorm')))
      .toEqual({
        kind: 'exec',
        command: '/Applications/WebStorm.app/Contents/MacOS/webstorm',
        args: ['--line', '10', '--column', '4', '/repo/a.ts'],
      });
  });

  it('runs the JetBrains executable itself off macOS', async () => {
    expect(await resolveOpenAtLine('webstorm', 'C:\\WS\\bin\\webstorm64.exe', 'C:\\r\\a.ts', 10, undefined, 'win32', noPlist))
      .toEqual({ kind: 'exec', command: 'C:\\WS\\bin\\webstorm64.exe', args: ['--line', '10', 'C:\\r\\a.ts'] });
  });

  it('gives up on a JetBrains bundle whose executable cannot be read, so the file still opens plainly', async () => {
    expect(await resolveOpenAtLine('webstorm', '/Applications/WebStorm.app', '/repo/a.ts', 10, undefined, 'darwin', noPlist))
      .toBeNull();
  });

  it('gives Sublime Text and Zed path:line', async () => {
    expect(await resolveOpenAtLine('sublime', '/Applications/Sublime Text.app', '/r/a.ts', 3, undefined, 'darwin', noPlist))
      .toEqual({ kind: 'exec', command: '/Applications/Sublime Text.app/Contents/SharedSupport/bin/subl', args: ['/r/a.ts:3'] });
    expect(await resolveOpenAtLine('zed', '/usr/bin/zed', '/r/a.ts', 3, 2, 'linux', noPlist))
      .toEqual({ kind: 'exec', command: '/usr/bin/zed', args: ['/r/a.ts:3:2'] });
  });

  it('returns null for an editor with no way to take a line', async () => {
    expect(await resolveOpenAtLine('emacs', '/usr/bin/emacs', '/r/a.ts', 3, undefined, 'linux', noPlist)).toBeNull();
    expect(canOpenAtLine('emacs')).toBe(false);
    expect(canOpenAtLine('cursor')).toBe(true);
  });
});

import { expandLineArguments } from '../customIntegration';

describe('expandLineArguments — custom editor (#508)', () => {
  it('replaces %LINE% and %COLUMN% wherever they sit in an argument', () => {
    expect(expandLineArguments(['--line', '%LINE%', '/r/a.ts:%LINE%:%COLUMN%'], 12, 4))
      .toEqual(['--line', '12', '/r/a.ts:12:4']);
  });

  it('puts the cursor at 1:1 when the file is opened without a position', () => {
    expect(expandLineArguments(['--line', '%LINE%', '/r/a.ts'])).toEqual(['--line', '1', '/r/a.ts']);
  });

  it('leaves a template without the tokens untouched', () => {
    expect(expandLineArguments(['/r/a.ts'], 12, 4)).toEqual(['/r/a.ts']);
  });
});
