export interface CcbInstallHint {
  /** The exact command to paste, correct for this platform's shells. */
  command: string;
  /** Shells the command works in — a display hint for WHERE to paste it. */
  shells: string[];
}

// The npm package that ships the `ccb` binary. Note the two names differ: the
// package moved into the Swttch kit, the executable did not. That asymmetry is
// deliberate — `ccb` is a name users type and this backend exec's, so renaming
// it would make an already-installed command disappear. It also means we never
// have to uninstall anything: whoever installed the old claude-code-battery
// still has a working `ccb`, and installing the kit alongside it is harmless
// because both resolve to the same code.
const CCB_PACKAGE = '@swttch/extend-kit';

/**
 * The command + shells a user should paste to install ccb themselves.
 *
 * On win32 a bare `npm` resolves to npm.ps1 in PowerShell, which the default
 * execution policy blocks — the exact wall a user hits pasting the old notice.
 * `npm.cmd` (a batch launcher) runs the same install in Command Prompt,
 * PowerShell, and Git Bash alike, so we hand back that form. On unix `npm` works
 * in any terminal.
 *
 * Pure and parameterised over platform so it is unit-testable without touching
 * the real environment.
 */
export function ccbInstallHint(platform: NodeJS.Platform = process.platform): CcbInstallHint {
  if (platform === 'win32') {
    return {
      command: `npm.cmd install -g ${CCB_PACKAGE}`,
      shells: ['Command Prompt', 'PowerShell', 'Git Bash'],
    };
  }
  return {
    command: `npm install -g ${CCB_PACKAGE}`,
    shells: ['Terminal'],
  };
}
