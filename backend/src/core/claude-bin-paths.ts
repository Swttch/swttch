import { join } from 'path';

/**
 * Well-known directories where the `claude` CLI (and other tools the backend
 * spawns) may live. An IDE launched from the GUI inherits a minimal PATH that
 * often omits these, so they are prepended to the spawn PATH in claude.ts.
 *
 * Pure and parameterised over env/platform so the set is unit-testable without
 * touching the real environment. existsSync filtering and the dynamic nvm probe
 * stay in claude.ts (those have side effects).
 *
 * Note: `~/.claude/local` is the location used by `claude migrate-installer`.
 * The official installer points the user's shell alias there, but a GUI-spawned
 * backend can't see shell aliases — without this entry, `spawn claude` fails
 * with ENOENT for the (very common) migrated install. See issue #76.
 */
export function candidateBinDirs(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): string[] {
  const home = env.HOME ?? env.USERPROFILE ?? '';
  if (!home) return [];

  const dirs: string[] = [
    join(home, '.claude', 'local'),                  // claude migrate-installer
    join(home, '.local', 'bin'),                     // pipx / manual / claude install.sh
    join(home, '.npm-global', 'bin'),                // npm global (custom prefix)
    join(home, '.volta', 'bin'),                     // volta
    join(home, '.fnm', 'aliases', 'default', 'bin'), // fnm
    join(home, '.claude-code-gui', 'bin'),           // cloudflared auto-install location
  ];

  if (platform === 'win32') {
    const appData = env.APPDATA ?? join(home, 'AppData', 'Roaming');
    const localAppData = env.LOCALAPPDATA ?? join(home, 'AppData', 'Local');
    dirs.push(
      join(appData, 'npm'),                // npm global install default on Windows
      join(localAppData, 'Volta', 'bin'),  // volta (Windows)
      join(home, 'scoop', 'shims'),        // scoop
    );
  } else {
    dirs.push(
      '/usr/local/bin',                    // macOS default / homebrew (Intel)
      '/opt/homebrew/bin',                 // homebrew (Apple Silicon)
    );
  }

  // Docker Desktop keeps its CLI here and does not always add it to the PATH a
  // GUI-launched process inherits. Needed since the backend started removing the
  // containers an MCP server leaves behind (#363); last of the candidates so it
  // cannot shadow a tool an earlier directory provides.
  dirs.push(join(home, '.docker', 'bin'));

  return dirs;
}
