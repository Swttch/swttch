/**
 * Hygiene for settings whose value is a filesystem path the user types or pastes.
 *
 * Kept out of `settings.ts` on purpose. This module touches no filesystem, so the
 * spawn path can depend on it without pulling in the settings reader/writer — and
 * without being erased by the whole-module `vi.mock('../features/settings')` that
 * several suites install.
 */

// A path copied out of a file manager, a terminal, or a chat message often carries a
// trailing space, and `spawn` treats that space as part of the filename:
// "/home/u/.local/bin/claude " fails with ENOENT while the very same path without the
// space runs fine. A reporter hit exactly that while trying to work around an
// unrelated auth failure, and the resulting ENOENT read as "the plugin cannot find a
// CLI that is plainly there" (issue #446).
//
// `openFilesWithCustom` is deliberately absent: its value is an object rather than a
// string, so trimming its inner path needs a different shape of fix than this one.
export const PATH_SETTING_KEYS = new Set(['cliPath', 'nodePath', 'terminalApp', 'openFilesWith']);

/**
 * Normalize a setting value for storage and for use.
 *
 * A path setting loses its surrounding whitespace, and a path that was nothing but
 * whitespace becomes null. Null is what every reader already treats as "auto-detect",
 * whereas "   " is truthy and would be handed to `spawn` verbatim.
 *
 * Non-path keys and non-string values pass through untouched, so callers can run every
 * setting through this function without knowing which keys hold paths.
 */
export function normalizeSettingValue(key: string, value: unknown): unknown {
  if (!PATH_SETTING_KEYS.has(key) || typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}
