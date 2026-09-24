/**
 * Guards the home-directory isolation set up by `vitest.setup.ts`.
 *
 * Without that setup file, importing almost any backend module makes the suite
 * read — and in the case of `profile.ts` rewrite — the developer's real
 * `~/.claude-code-gui`. Deleting the `setupFiles` entry from vitest.config.ts
 * causes no other test to fail, so this file exists to turn that silent loss of
 * protection into a red test.
 *
 * Every assertion here is side-effect free on purpose. If the isolation is
 * gone, this file must report it without touching real user data itself.
 */
import { describe, expect, it } from 'vitest';
import { homedir, tmpdir } from 'os';
import { join } from 'path';

describe('backend test home isolation', () => {
  it('runs vitest.setup.ts before the test modules', () => {
    expect(process.env.CCG_TEST_HOME, 'vitest.setup.ts did not run').toBeTruthy();
    expect(process.env.CCG_TEST_REAL_HOME).toBeTruthy();
  });

  it('moves the home directory away from the real one', () => {
    expect(homedir()).not.toBe(process.env.CCG_TEST_REAL_HOME);
    expect(homedir()).toBe(process.env.CCG_TEST_HOME);
  });

  it('puts the test home inside the temp directory', () => {
    expect(homedir().startsWith(tmpdir())).toBe(true);
  });

  it('keeps the user-data directory that modules derive from homedir() out of the real home', () => {
    // profile.ts, settings.ts, license.ts, account-store.ts and others all
    // build their paths exactly like this, at module load time.
    const userDataDir = join(homedir(), '.claude-code-gui');
    expect(userDataDir.startsWith(tmpdir())).toBe(true);
    expect(userDataDir.startsWith(join(String(process.env.CCG_TEST_REAL_HOME), '.claude-code-gui'))).toBe(false);
  });

  it('drops the inherited overrides that point back at real user data', () => {
    expect(process.env.CCG_HOME).toBeUndefined();
    expect(process.env.CLAUDE_CONFIG_DIR).toBeUndefined();
  });
});
