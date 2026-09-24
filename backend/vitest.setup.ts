/**
 * Test-home isolation — runs before every backend test file is imported.
 *
 * WHY THIS EXISTS
 * Most of the backend reads and writes the user-data directory by computing it
 * from the home directory at module load time, e.g.
 *
 *   const PROFILE_DIR = join(homedir(), '.claude-code-gui');   // profile.ts
 *   const SETTINGS_FILE = join(homedir(), '.claude-code-gui', 'settings.js');
 *   const LICENSE_DIR = join(homedir(), '.claude-code-gui');   // license.ts
 *
 * A test only has to import such a module — directly or through any transitive
 * import — for the real `~/.claude-code-gui` to be opened. Nothing in the test
 * has to mention the path, so the hazard is invisible at the call site and a
 * reviewer cannot spot it.
 *
 * That hazard is not theoretical: `announcements.ts` calls
 * `getAnnouncementsEnabled()`, which runs `ensureProfile()`, which rewrites
 * `~/.claude-code-gui/profile.json` whenever the file on disk does not match
 * the schema the reading code expects. A branch that renames a profile key
 * therefore makes a single test run rewrite the developer's real profile.
 *
 * WHY A GLOBAL SETUP FILE RATHER THAN PER-TEST MOCKS
 * Per-test `vi.mock('../profile')` calls only cover the modules somebody
 * remembered to enumerate. A measurement of the suite found 20 test files
 * reaching into the real home today, across profile.json, settings.js,
 * accounts.json, scheduled-messages.json, `~/.claude/`, and the shell rc files
 * — and any new test that imports a handler joins that list silently. Moving
 * the home directory itself covers every present and future case with one
 * decision, which is what the existing precedent in
 * `awaitSessionTranscript.test.ts` already does by hand for one file.
 *
 * WHAT IT DOES
 * Points HOME (POSIX) and USERPROFILE (Windows) at a fresh empty temp
 * directory, one per test file, and drops the two documented overrides that
 * would otherwise redirect a test back at real user data. `os.homedir()` reads
 * those variables on every call, so every module above lands in the temp
 * directory no matter when it computed its path.
 *
 * A test that wants its own home or config dir still sets it afterwards: this
 * file runs before the test module is evaluated, so a module-scope
 * `process.env.CCG_HOME = ...` (as in getUsage.test.ts and usage-cache.test.ts)
 * still wins.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll } from 'vitest';

const realHome = homedir();
const testHome = mkdtempSync(join(tmpdir(), 'ccg-test-home-'));

// Recorded so the isolation itself can be asserted by a test. See
// src/__tests__/test-home-isolation.test.ts.
process.env.CCG_TEST_REAL_HOME = realHome;
process.env.CCG_TEST_HOME = testHome;

process.env.HOME = testHome;
process.env.USERPROFILE = testHome;

// Documented overrides that point at real user data. `CCG_HOME` moves the
// user-data directory (see cli/install.sh) and `CLAUDE_CONFIG_DIR` moves the
// Claude CLI's own config directory. Inheriting either from the developer's
// shell would defeat the redirect above for the code paths that honor them.
delete process.env.CCG_HOME;
delete process.env.CLAUDE_CONFIG_DIR;

if (homedir() === realHome) {
  // Node resolves `os.homedir()` from HOME on POSIX and USERPROFILE on
  // Windows. If that ever stops being true, fail loudly here instead of
  // letting the whole suite quietly operate on the developer's real files.
  throw new Error(
    `vitest.setup.ts: failed to isolate the home directory — os.homedir() still returns ${realHome}. ` +
      'Backend tests would read and write real user data; refusing to run.',
  );
}

afterAll(() => {
  rmSync(testHome, { recursive: true, force: true });
});
