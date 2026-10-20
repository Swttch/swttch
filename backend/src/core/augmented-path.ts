import { existsSync } from 'fs';
import { join, delimiter, resolve } from 'path';
import { execFileSync } from 'child_process';
import { candidateBinDirs } from './claude-bin-paths';
import { consoleSafeExecOptions } from './console-safe';

/**
 * Build an augmented PATH that includes well-known bin directories where the
 * CLIs the backend spawns (`claude`, `cloudflared`, ...) are likely installed.
 *
 * An IDE launched from the GUI hands its child Node.js process a minimal PATH
 * that often omits nvm / volta / homebrew paths. Without this, a tool the user
 * has clearly installed (e.g. `brew install cloudflared`) is invisible to the
 * backend's `which` lookups. See issues #59 / #76.
 */
export function buildAugmentedPath(): string {
  const basePath = process.env.PATH ?? '';
  const home = process.env.HOME ?? process.env.USERPROFILE ?? '';
  if (!home) return basePath;

  const extraDirs: string[] = candidateBinDirs();

  // Add nvm current version bin if NVM_DIR is set
  const nvmDir = process.env.NVM_DIR ?? join(home, '.nvm');
  try {
    // Validate nvmDir is a real path (prevent injection via NVM_DIR)
    const resolvedNvmDir = resolve(nvmDir);
    const nvmScript = join(resolvedNvmDir, 'nvm.sh');
    if (!existsSync(nvmScript)) throw new Error('nvm.sh not found');

    // Escape single quotes in path for safe bash embedding: ' -> '\''
    const escapedNvmScript = nvmScript.replace(/'/g, "'\\''");
    const nvmDefaultBin = execFileSync(
      'bash',
      ['-c', `source '${escapedNvmScript}' --no-use 2>/dev/null && nvm which current 2>/dev/null`],
      consoleSafeExecOptions({ encoding: 'utf-8', timeout: 3000 }),
    ).trim();
    if (nvmDefaultBin) {
      const nvmBinDir = nvmDefaultBin.substring(0, nvmDefaultBin.lastIndexOf('/'));
      if (nvmBinDir) extraDirs.push(nvmBinDir);
    }
  } catch {
    // nvm not available - skip
  }

  const priorityDirs = extraDirs.filter((d) => existsSync(d));
  if (priorityDirs.length === 0) return basePath;
  const prioritySet = new Set(priorityDirs);
  const remaining = basePath.split(delimiter).filter((d) => !prioritySet.has(d)).join(delimiter);
  return `${priorityDirs.join(delimiter)}${delimiter}${remaining}`;
}

// Computed once at module load — the set of well-known dirs doesn't change
// during a backend session, and the nvm probe spawns bash (worth caching).
let cachedPath: string | null = null;

/** The augmented PATH, computed lazily and cached for the process lifetime. */
export function augmentedPath(): string {
  if (cachedPath === null) cachedPath = buildAugmentedPath();
  return cachedPath;
}

/**
 * `process.env` with PATH replaced by the augmented PATH. Pass `extra` to
 * override or add further variables (applied after PATH).
 */
export function augmentedEnv(extra?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return { ...process.env, PATH: augmentedPath(), ...extra };
}
