import { readFile, readdir } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';
import type { EnvVarOrigin } from '../../shared';


/**
 * Shell startup files, in the order a shell would read them.
 *
 * Both zsh and bash families are listed regardless of the current shell: the
 * variable may have been set years ago under a shell the user has since
 * replaced, and reading a file that does not exist costs nothing.
 */
const SHELL_FILES = [
  '.zshenv', '.zprofile', '.zshrc', '.zlogin',
  '.bash_profile', '.bash_login', '.bashrc', '.profile',
  '.config/fish/config.fish',
];

/** Files a Linux desktop session reads, which is how a GUI IDE inherits a variable. */
const SYSTEM_FILES = ['/etc/environment', '/etc/profile'];

/** Directories whose every file is sourced into the session (Linux systemd/user). */
const SYSTEM_DIRS = [
  { dir: '/etc/profile.d', suffix: '.sh' },
  { dir: join(homedir(), '.config/environment.d'), suffix: '.conf' },
];

/** Project files that tooling loads into the environment. */
const DOTENV_FILES = ['.env', '.env.local', '.env.development'];

/** Claude's own settings, whose `env` block the CLI reads directly. */
const CLAUDE_SETTINGS = ['.claude/settings.json', '.claude/settings.local.json'];

/**
 * A shell assignment: `NAME=`, `export NAME=`, `set -x NAME`, `setenv NAME`.
 * Leading whitespace is allowed; a commented-out line is not a source.
 */
function shellAssigns(line: string, name: string): boolean {
  const trimmed = line.trim();
  if (trimmed.startsWith('#')) return false;
  return new RegExp(`(^|[;&|]\\s*)(export\\s+|declare\\s+-x\\s+|set\\s+-x\\s+|setenv\\s+)?${name}\\s*[= ]`).test(trimmed);
}

/** A JSON/JS key: `"NAME":` or `NAME:` inside an env block. */
function structuredAssigns(line: string, name: string): boolean {
  const trimmed = line.trim();
  if (trimmed.startsWith('//')) return false;
  return new RegExp(`["']?${name}["']?\\s*:`).test(trimmed);
}

/**
 * Rewrite the home directory as `~`, because this path exists to be read by a person
 * and the webview has no idea what the home directory is.
 *
 * Exported so the rewrite can be tested without writing into the real home directory.
 */
export function displayPath(path: string, home: string = homedir()): string {
  return path === home || path.startsWith(home + '/') ? '~' + path.slice(home.length) : path;
}

async function findInFile(
  path: string,
  name: string,
  kind: EnvVarOrigin['kind'],
  matches: (line: string, name: string) => boolean,
): Promise<EnvVarOrigin[]> {
  let text: string;
  try {
    text = await readFile(path, 'utf-8');
  } catch {
    // Absent or unreadable is the common case, not an error worth reporting.
    return [];
  }
  const shown = displayPath(path);
  const found: EnvVarOrigin[] = [];
  text.split('\n').forEach((line, index) => {
    if (matches(line, name)) found.push({ kind, path: shown, line: index + 1 });
  });
  return found;
}

/**
 * Find every place that assigns [name], so a user who did not know the variable
 * existed can go and look at it.
 *
 * Searches the files a person actually edits: shell startup files, the Linux
 * session files a GUI IDE inherits from, project `.env` files, Claude's own
 * settings `env` blocks, and this plugin's settings. Reports **locations only**,
 * never values.
 *
 * An empty result is itself an answer, and the UI says so: the variable reached
 * the process some other way — typed inline on the command line that launched the
 * IDE, exported in a shell session by hand, set through `launchctl`/`setx`, or
 * inherited from whatever launched the IDE.
 */
export async function traceEnvVarOrigins(name: string, workingDir?: string): Promise<EnvVarOrigin[]> {
  // A crafted name must not become part of the regexes above.
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return [];

  const home = homedir();
  const searches: Promise<EnvVarOrigin[]>[] = [];

  for (const file of SHELL_FILES) {
    searches.push(findInFile(join(home, file), name, 'shell-file', shellAssigns));
  }
  for (const file of SYSTEM_FILES) {
    searches.push(findInFile(file, name, 'system-file', shellAssigns));
  }
  for (const file of CLAUDE_SETTINGS) {
    searches.push(findInFile(join(home, file), name, 'claude-settings', structuredAssigns));
  }
  searches.push(
    findInFile(join(home, '.claude-code-gui', 'settings.js'), name, 'plugin-settings', structuredAssigns),
  );

  if (workingDir) {
    for (const file of DOTENV_FILES) {
      searches.push(findInFile(join(workingDir, file), name, 'dotenv', shellAssigns));
    }
    for (const file of CLAUDE_SETTINGS) {
      searches.push(findInFile(join(workingDir, file), name, 'claude-settings', structuredAssigns));
    }
    searches.push(
      findInFile(join(workingDir, '.claude-code-gui', 'settings.json'), name, 'plugin-settings', structuredAssigns),
    );
  }

  for (const { dir, suffix } of SYSTEM_DIRS) {
    searches.push(
      readdir(dir)
        .then((entries) =>
          Promise.all(
            entries
              .filter((entry) => entry.endsWith(suffix))
              .map((entry) => findInFile(join(dir, entry), name, 'system-file', shellAssigns)),
          ).then((results) => results.flat()),
        )
        .catch(() => []),
    );
  }

  const results = await Promise.all(searches);
  return rankByAuthority(results.flat(), workingDir);
}

/**
 * Order the places a variable is set so the one that actually decides it comes first.
 *
 * The list is read top-down by someone about to edit a file, so the first line has to be the
 * file worth editing. Claude's settings files win over anything the process merely inherited,
 * and a project's settings win over the global ones — measured against `claude`, and matched
 * by features/settings-env.ts. A shell startup file listed first would send someone to change
 * a value that is overridden the moment it is read.
 *
 * Plugin settings sit between the two: they supply CLAUDE_CONFIG_DIR, which no settings file
 * may define, so for that one name they are the deciding file.
 *
 * Stable within each rank, so the search order above still decides ties.
 */
function rankByAuthority(origins: EnvVarOrigin[], workingDir?: string): EnvVarOrigin[] {
  // Compared against the same rewrite the paths carry: `path` has already had the home
  // directory replaced with `~`, so an untouched workingDir would never match one.
  const projectPrefix = workingDir === undefined ? undefined : displayPath(workingDir);
  const rank = (origin: EnvVarOrigin): number => {
    const inProject = projectPrefix !== undefined && origin.path.startsWith(projectPrefix);
    if (origin.kind === 'claude-settings') return inProject ? 0 : 1;
    if (origin.kind === 'plugin-settings') return inProject ? 2 : 3;
    return 4;
  };
  return origins
    .map((origin, index) => ({ origin, index }))
    .sort((a, b) => rank(a.origin) - rank(b.origin) || a.index - b.index)
    .map(({ origin }) => origin);
}
