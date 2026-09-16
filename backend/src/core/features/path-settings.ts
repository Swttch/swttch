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
export const PATH_SETTING_KEYS = new Set(['cliPath', 'nodePath', 'terminalApp', 'openFilesWith']);

// The custom file opener holds its path inside an object, `{ path, arguments }`, so the
// plain string rule above cannot reach it — but a path typed there is spawned the same
// way and breaks the same way.
export const CUSTOM_OPENER_KEY = 'openFilesWithCustom';

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
  if (key === CUSTOM_OPENER_KEY) return normalizeCustomOpener(value);
  if (!PATH_SETTING_KEYS.has(key) || typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * Trim the `path` of a custom file opener, leaving `arguments` exactly as typed.
 *
 * Only the path is spawned, and only the path breaks on stray whitespace. The argument
 * template is a command line the user wrote (`-n -w %TARGET_PATH%`), where spacing is
 * meaningful and trimming it would be us editing their command.
 *
 * A path that trims to nothing cannot open anything, so the whole opener becomes null —
 * the value the rest of the code already reads as "no custom opener configured".
 */
function normalizeCustomOpener(value: unknown): unknown {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return value;
  const custom = value as Record<string, unknown>;
  if (typeof custom.path !== 'string') return value;
  const path = custom.path.trim();
  if (path === '') return null;
  return { ...custom, path };
}
