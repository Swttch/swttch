import { describe, it, expect } from 'vitest';
import { ccbInstallHint } from '../ccb-install-hint';
import { PackageManager } from '../../shared';

// A Node with no npm sibling on disk, so the hint falls back to the bare name —
// which is what a terminal user should paste anyway.
const NODE = '/nowhere/bin/node';

describe('ccbInstallHint', () => {
  it('uses npm.cmd on win32 so it survives the PowerShell execution policy', () => {
    const h = ccbInstallHint(PackageManager.NPM, NODE, 'win32');
    expect(h.command).toBe('npm.cmd install -g @swttch/extend-kit');
    expect(h.shells).toEqual(['Command Prompt', 'PowerShell', 'Git Bash']);
  });

  it('uses plain npm in a single terminal on unix', () => {
    for (const p of ['darwin', 'linux'] as NodeJS.Platform[]) {
      const h = ccbInstallHint(PackageManager.NPM, NODE, p);
      expect(h.command).toBe('npm install -g @swttch/extend-kit');
      expect(h.shells).toEqual(['Terminal']);
    }
  });

  it('installs the kit but still calls the binary ccb — the command name did not move', () => {
    // The package was renamed; the executable it installs was not. Anyone who
    // already has the old package keeps a working `ccb`, so we never need to
    // uninstall anything to make the usage panel work.
    for (const p of ['win32', 'darwin', 'linux'] as NodeJS.Platform[]) {
      const c = ccbInstallHint(PackageManager.NPM, NODE, p).command;
      expect(c).toContain('@swttch/extend-kit');
      expect(c).not.toContain('claude-code-battery');
    }
  });

  // #298: the hint used to be a hardcoded `npm install -g` on every machine, so
  // a volta/pnpm/yarn user was told to paste a command that installs into a
  // place their own tooling never reads. The suggestion has to name the manager
  // that actually owns this machine's global packages.
  it('names the manager that owns this machine, not always npm', () => {
    expect(ccbInstallHint(PackageManager.VOLTA, NODE, 'darwin').command).toBe(
      'volta install @swttch/extend-kit',
    );
    expect(ccbInstallHint(PackageManager.PNPM, NODE, 'darwin').command).toBe(
      'pnpm add -g @swttch/extend-kit',
    );
    expect(ccbInstallHint(PackageManager.YARN, NODE, 'darwin').command).toBe(
      'yarn global add @swttch/extend-kit',
    );
  });

  // brew/native/winget distribute Claude Code itself and cannot install an npm
  // package, so the honest suggestion is npm — the same fallback the button takes.
  it('falls back to npm for managers that cannot install an npm package', () => {
    for (const pm of [PackageManager.HOMEBREW, PackageManager.NATIVE, PackageManager.WINGET]) {
      expect(ccbInstallHint(pm, NODE, 'darwin').command).toBe('npm install -g @swttch/extend-kit');
    }
  });

  // The installer pins npm to the backend Node's sibling because its PATH is the
  // IDE's. A terminal has the user's own PATH, so pasting an absolute path would
  // be noise — the hint reports the basename.
  // On win32 the sibling is an absolute `...\npm.cmd`; the hint must still show
  // the pasteable basename, keeping the .cmd extension that survives the
  // PowerShell execution policy.
  it('keeps the .cmd basename on win32 even when the sibling is absolute', () => {
    const { command } = ccbInstallHint(PackageManager.NPM, 'C:\\Program Files\\nodejs\\node.exe', 'win32');
    expect(command).toBe('npm.cmd install -g @swttch/extend-kit');
    expect(command).not.toContain('\\');
  });

  it('reports a bare launcher name, never the absolute sibling path', () => {
    const { command } = ccbInstallHint(PackageManager.NPM, '/opt/homebrew/bin/node', 'darwin');
    // Only the launcher is checked for a path: the package name legitimately
    // contains a slash (`@swttch/extend-kit`).
    const launcher = command.split(' ')[0];
    expect(launcher).toBe('npm');
    expect(command).toBe('npm install -g @swttch/extend-kit');
  });
});
