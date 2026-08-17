import { PackageManager, UpdateMode } from '../shared';
import { detectInstallCoordinate, toPackageManager } from './install-coordinate';

export const CLAUDE_NPM_PACKAGE = '@anthropic-ai/claude-code';

/**
 * Infer how the running `claude` binary was installed from its resolved path(s).
 *
 * Pure and parameterised over paths/home/platform so it is unit-testable without
 * touching the real environment. Pass every path you know for the binary — the
 * `which`/`where` result AND its realpath — because the *shim* location (e.g.
 * `~/.volta/bin`) and the *target* (e.g. `.../lib/node_modules/...`) each reveal a
 * different install method. A `/usr/local/bin/claude` symlink says nothing; its
 * realpath into `node_modules` says "npm".
 *
 * ## One value, three questions
 *
 * This returns a single name because that is what the update UI and the wire
 * format speak. It is DERIVED from a three-axis coordinate rather than guessed
 * by an ordered list of substring tests, because "which package manager" is
 * really three separate questions — which runtime manages Node, which tool owns
 * global npm packages, and which channel ships the `claude` app — and the old
 * flat list could not tell them apart.
 *
 * The distinction is not academic. Under volta, `~/.volta/...` matched "volta"
 * for BOTH volta's own package store and the ordinary npm globals of the Node
 * volta manages. Those are different stores, so a package removed from one
 * survived in the other and kept being reported as installed. See
 * install-coordinate.ts.
 */
export function detectPackageManager(
  paths: Array<string | null | undefined>,
  home: string,
  platform: NodeJS.Platform = process.platform,
): PackageManager {
  return toPackageManager(detectInstallCoordinate(paths, home, platform));
}

/**
 * Which Homebrew cask the binary belongs to: the stable `claude-code` or the
 * `claude-code@latest` channel. Derived from the Caskroom path segment so
 * `brew upgrade` targets the cask the user actually installed.
 */
export function detectHomebrewCask(paths: Array<string | null | undefined>): string {
  const joined = paths
    .filter((p): p is string => typeof p === 'string' && p.length > 0)
    .join('/')
    .toLowerCase();
  return joined.includes('claude-code@latest') ? 'claude-code@latest' : 'claude-code';
}

/** The update affordance a package manager supports. */
export function updateModeFor(pm: PackageManager): UpdateMode {
  switch (pm) {
    case PackageManager.NPM:
    case PackageManager.PNPM:
    case PackageManager.YARN:
    case PackageManager.VOLTA:
      return UpdateMode.VERSIONED;
    case PackageManager.NATIVE:
    case PackageManager.HOMEBREW:
    case PackageManager.WINGET:
      return UpdateMode.SIMPLE;
    default:
      return UpdateMode.NONE;
  }
}

/** True when `latest` is a strictly higher semver than `current`. */
export function isNewerVersion(latest: string, current: string): boolean {
  const l = latest.split('.').map((n) => parseInt(n, 10));
  const c = current.split('.').map((n) => parseInt(n, 10));
  for (let i = 0; i < Math.max(l.length, c.length); i++) {
    const lv = l[i] ?? 0;
    const cv = c[i] ?? 0;
    if (Number.isNaN(lv) || Number.isNaN(cv)) return false;
    if (lv > cv) return true;
    if (lv < cv) return false;
  }
  return false;
}

/** Whether an update should be offered: a known mode AND a newer version exists. */
export function isCliUpdatable(
  updateMode: UpdateMode,
  current: string | null,
  latest: string | null,
): boolean {
  if (updateMode === UpdateMode.NONE) return false;
  if (!current || !latest) return false;
  return isNewerVersion(latest, current);
}

/** Parse the JSON emitted by `npm view <pkg> dist-tags --json`. */
export function parseDistTags(json: string): { stable: string | null; latest: string | null } {
  try {
    const obj = JSON.parse(json) as Record<string, unknown>;
    const pick = (k: string) => (typeof obj[k] === 'string' ? (obj[k] as string) : null);
    return { stable: pick('stable'), latest: pick('latest') };
  } catch {
    return { stable: null, latest: null };
  }
}

export interface UpdateCommand {
  command: string;
  args: string[];
}

/**
 * The install-method-specific command that updates the CLI in place.
 *
 * VERSIONED managers take a concrete `version` (resolve dist-tags to a number
 * first — some managers don't honour `@stable`). SIMPLE managers ignore it and
 * update to the latest of their channel. Returns null for UnKNOWN (no path).
 *
 * NATIVE returns `claude update`; the caller substitutes the resolved claude
 * binary for the bare `claude` command. HOMEBREW targets the given cask (default
 * `claude-code`, the stable channel).
 */
export function buildUpdateCommand(
  pm: PackageManager,
  version: string | null,
  homebrewCask = 'claude-code',
): UpdateCommand | null {
  const spec = version ? `${CLAUDE_NPM_PACKAGE}@${version}` : `${CLAUDE_NPM_PACKAGE}@latest`;
  switch (pm) {
    case PackageManager.NPM:
      return { command: 'npm', args: ['install', '-g', spec] };
    case PackageManager.PNPM:
      return { command: 'pnpm', args: ['add', '-g', spec] };
    case PackageManager.YARN:
      return { command: 'yarn', args: ['global', 'add', spec] };
    case PackageManager.VOLTA:
      return { command: 'volta', args: ['install', spec] };
    case PackageManager.NATIVE:
      return { command: 'claude', args: ['update'] };
    case PackageManager.HOMEBREW:
      return { command: 'brew', args: ['upgrade', homebrewCask] };
    case PackageManager.WINGET:
      return { command: 'winget', args: ['upgrade', '--id', 'Anthropic.ClaudeCode', '-e'] };
    default:
      return null;
  }
}
