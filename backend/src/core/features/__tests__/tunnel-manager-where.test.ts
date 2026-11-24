import { describe, it, expect } from 'vitest';
import { firstOutputLine } from '../tunnel-manager';

describe('firstOutputLine', () => {
  it('takes the first of several Windows `where` matches without its CR', () => {
    // Two cloudflared installs (the auto-installed copy and a winget/MSI one): spawning the
    // first path with a trailing '\r' failed with ENOENT although the file exists.
    const stdout =
      'C:\\Users\\me\\.claude-code-gui\\bin\\cloudflared.exe\r\n' +
      'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe\r\n';

    expect(firstOutputLine(stdout)).toBe('C:\\Users\\me\\.claude-code-gui\\bin\\cloudflared.exe');
  });

  it('reads a single POSIX `which` line', () => {
    expect(firstOutputLine('/opt/homebrew/bin/cloudflared\n')).toBe('/opt/homebrew/bin/cloudflared');
  });

  it('returns an empty string when nothing was printed', () => {
    expect(firstOutputLine('')).toBe('');
    expect(firstOutputLine('\r\n')).toBe('');
  });
});
