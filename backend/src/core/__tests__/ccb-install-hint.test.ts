import { describe, it, expect } from 'vitest';
import { ccbInstallHint } from '../ccb-install-hint';

describe('ccbInstallHint', () => {
  it('uses npm.cmd on win32 so it survives the PowerShell execution policy', () => {
    const h = ccbInstallHint('win32');
    expect(h.command).toBe('npm.cmd install -g @swttch/extend-kit');
    expect(h.shells).toEqual(['Command Prompt', 'PowerShell', 'Git Bash']);
  });

  it('uses plain npm in a single terminal on unix', () => {
    for (const p of ['darwin', 'linux'] as NodeJS.Platform[]) {
      const h = ccbInstallHint(p);
      expect(h.command).toBe('npm install -g @swttch/extend-kit');
      expect(h.shells).toEqual(['Terminal']);
    }
  });

  it('installs the kit but still calls the binary ccb — the command name did not move', () => {
    // The package was renamed; the executable it installs was not. Anyone who
    // already has the old package keeps a working `ccb`, so we never need to
    // uninstall anything to make the usage panel work.
    for (const p of ['win32', 'darwin', 'linux'] as NodeJS.Platform[]) {
      expect(ccbInstallHint(p).command).toContain('@swttch/extend-kit');
      expect(ccbInstallHint(p).command).not.toContain('claude-code-battery');
    }
  });
});
