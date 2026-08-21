/**
 * Parser for the `/etc/os-release` format (freedesktop / systemd spec).
 *
 * Linux is the one platform where `os.release()` answers the wrong question: it
 * returns the kernel release (e.g. `6.8.0-45-generic`), while what identifies the
 * machine for a bug report is the *distribution* — Ubuntu 24.04, Fedora 41, Arch.
 * That lives only in `/etc/os-release`, so we read and parse it ourselves.
 *
 * Format rules that matter here (per the spec):
 * - Shell-compatible `KEY=value` assignments, but *not* shell: variable expansion
 *   is explicitly unsupported, so a plain line parser is correct and we never
 *   hand the file to a shell.
 * - Values are enclosed in double or single quotes when they contain spaces,
 *   semicolons or other special characters. Quoting is permitted even when not
 *   required, so quotes must always be stripped rather than assumed absent.
 * - Inside quotes, shell special characters (`$`, quotes, backslash, backtick)
 *   are backslash-escaped.
 * - Blank lines and `#` comments are allowed.
 */

/** Keys we care about, in the order we prefer them for display. */
export interface OsRelease {
  /** Ready-made display string, e.g. `Ubuntu 24.04.1 LTS`. Preferred when present. */
  prettyName?: string;
  /** OS name without a version, e.g. `Ubuntu`. */
  name?: string;
  /** Version with any code name, e.g. `24.04.1 LTS (Noble Numbat)`. */
  version?: string;
  /** Machine-readable version, e.g. `24.04`. */
  versionId?: string;
  /** Machine-readable id, e.g. `ubuntu`. */
  id?: string;
}

/**
 * Unquote and unescape a single `os-release` value.
 *
 * Only strips a quote pair when the *same* quote character opens and closes the
 * value, so an unquoted value that merely contains an apostrophe is left intact.
 * Backslash escapes are resolved inside quotes only, matching the spec.
 */
function unquote(raw: string): string {
  const value = raw.trim();
  if (value.length < 2) return value;

  const first = value[0];
  const last = value[value.length - 1];
  if ((first === '"' || first === "'") && last === first) {
    return value.slice(1, -1).replace(/\\(.)/g, '$1');
  }
  return value;
}

/**
 * Parse the contents of an `/etc/os-release` file. Unknown keys are ignored;
 * a malformed line is skipped rather than aborting the parse, since a single bad
 * line must not cost us the whole identification.
 */
export function parseOsRelease(contents: string): OsRelease {
  const result: OsRelease = {};

  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith('#')) continue;

    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;

    const key = trimmed.slice(0, eq).trim();
    const value = unquote(trimmed.slice(eq + 1));
    if (value.length === 0) continue;

    switch (key) {
      case 'PRETTY_NAME': result.prettyName = value; break;
      case 'NAME': result.name = value; break;
      case 'VERSION': result.version = value; break;
      case 'VERSION_ID': result.versionId = value; break;
      case 'ID': result.id = value; break;
      default: break;
    }
  }

  return result;
}

/**
 * Build the display string for a Linux machine from parsed os-release fields.
 *
 * `PRETTY_NAME` already reads as "Ubuntu 24.04.1 LTS" and is what the spec
 * designates for presentation, so it wins outright. Otherwise we rebuild an
 * equivalent from NAME + VERSION (or VERSION_ID). The spec's own fallback when
 * nothing is set is the literal `Linux`.
 */
export function formatOsRelease(parsed: OsRelease): string {
  if (parsed.prettyName) return parsed.prettyName;

  const name = parsed.name ?? 'Linux';
  const version = parsed.version ?? parsed.versionId;
  return version ? `${name} ${version}` : name;
}
