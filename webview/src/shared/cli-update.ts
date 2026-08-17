/**
 * Shared types for Claude Code CLI version detection + updating.
 *
 * NOTE: This file is mirrored 1:1 from `backend/src/shared/cli-update.ts`.
 * Any edit there MUST be copied here (see `shared/CLAUDE.md`).
 */

/**
 * How the running `claude` binary was installed, inferred from its resolved path.
 *
 * Only values the path-based detector can actually produce are listed. System
 * package managers (apt/dnf/apk) install to `/usr/bin` and cannot be told apart
 * from a bare path — and they need sudo to update anyway — so they fall under
 * UNKNOWN, which yields no update affordance (same safe outcome).
 */
export enum PackageManager {
  NPM = 'npm',
  PNPM = 'pnpm',
  YARN = 'yarn',
  VOLTA = 'volta',
  /** Claude's own native installer (curl/irm → ~/.local/bin). Updates via `claude update`. */
  NATIVE = 'native',
  /** Homebrew cask (claude-code / claude-code@latest). Updates via `brew upgrade`. */
  HOMEBREW = 'homebrew',
  /** Windows WinGet package (Anthropic.ClaudeCode). Updates via `winget upgrade`. */
  WINGET = 'winget',
  /** Undetectable / system-managed / needs sudo → no non-interactive update path. */
  UNKNOWN = 'unknown',
}

/**
 * WHICH NODE is on this machine, and who put it there.
 *
 * This is a DIFFERENT question from {@link LibraryManager} below, and conflating
 * the two is what made a removed package keep reappearing (#298 follow-up).
 * A runtime manager installs Node *versions*; it does not own npm packages. Two
 * of them can even be layered — volta manages a Node, and `npm i -g` under that
 * Node writes into that Node's own global folder, which volta does not track.
 *
 * `volta` appears here AND in {@link LibraryManager}, because volta genuinely
 * does both jobs: it switches Node versions, and `volta install <pkg>` keeps its
 * own package store separate from any Node's global folder.
 */
export enum RuntimeManager {
  /** ~/.volta — manages Node versions AND has its own package store. */
  VOLTA = 'volta',
  /** ~/.nvm/versions/node/<v> — a shell function, never a binary on PATH. */
  NVM = 'nvm',
  /** ~/.fnm or ~/Library/Application Support/fnm. */
  FNM = 'fnm',
  /** ~/.asdf/installs/nodejs/<v>. */
  ASDF = 'asdf',
  /** ~/.local/share/mise/installs/node/<v> (formerly rtx). */
  MISE = 'mise',
  /** ~/.nodenv/versions/<v>. */
  NODENV = 'nodenv',
  /** `n` — installs into a prefix (default /usr/local), no per-version dir of its own. */
  N = 'n',
  /** ~/.proto/tools/node/<v> (moonrepo proto). */
  PROTO = 'proto',
  /** ~/.nvs/node/<v> (Windows-friendly nvm alternative). */
  NVS = 'nvs',
  /** Homebrew's node formula — /opt/homebrew or /usr/local/Cellar. */
  HOMEBREW = 'homebrew',
  /** nodejs.org installer, distro package, or anything else unmanaged. */
  SYSTEM = 'system',
  /** Could not tell from the path. */
  UNKNOWN = 'unknown',
}

/**
 * WHICH TOOL installs npm packages globally on this machine.
 *
 * Separate from {@link RuntimeManager} because "volta's npm" and "volta's pnpm"
 * are different stores under the same runtime: a package installed with one is
 * invisible to the other. Pinning CRUD (install / read / update / delete) to one
 * coordinate is what keeps a delete from silently missing a copy.
 */
export enum LibraryManager {
  /** <node prefix>/lib/node_modules (unix) or %APPDATA%\npm\node_modules (win32). */
  NPM = 'npm',
  /** ~/Library/pnpm/global/<n>/node_modules, or `pnpm root -g`. */
  PNPM = 'pnpm',
  /** ~/.config/yarn/global/node_modules (classic), or `yarn global dir`. */
  YARN = 'yarn',
  /** ~/.bun/install/global/node_modules. */
  BUN = 'bun',
  /** volta's own per-package store, independent of any Node's global folder. */
  VOLTA = 'volta',
  /** Could not tell. Callers fall back to npm, which is the safest guess. */
  UNKNOWN = 'unknown',
}

/**
 * Where the `claude` APP itself came from, when it was not an npm package.
 *
 * These channels ship Claude Code as an application; none of them can install
 * `@swttch/extend-kit` or any other npm package. Keeping them out of
 * {@link LibraryManager} is the point — a Homebrew-installed `claude` says
 * nothing about which tool owns this machine's npm globals.
 */
export enum AppChannel {
  /** Claude's own installer (curl/irm → ~/.local/bin, ~/.claude/local). */
  NATIVE = 'native',
  /** Homebrew cask claude-code / claude-code@latest. */
  HOMEBREW_CASK = 'homebrew-cask',
  /** Windows WinGet package Anthropic.ClaudeCode. */
  WINGET = 'winget',
  /** apt/dnf/apk/snap — needs sudo, no non-interactive path. */
  SYSTEM = 'system',
  /** Not an app-channel install (it came from an npm-style manager). */
  NONE = 'none',
}

/**
 * The full coordinate of an install: runtime + library manager + app channel.
 *
 * Every CRUD operation on a global package must resolve THIS, not a single enum
 * value, so that install / read / update / delete all address the same store.
 */
export interface InstallCoordinate {
  runtime: RuntimeManager;
  library: LibraryManager;
  channel: AppChannel;
}

/** Update affordance the UI shows, derived from the package manager. */
export enum UpdateMode {
  /** PM can install a specific version → dropdown offering stable / latest. */
  VERSIONED = 'versioned',
  /** One upgrade command, no version targeting → a plain Update button. */
  SIMPLE = 'simple',
  /** No non-interactive update path → no affordance shown. */
  NONE = 'none',
}

/** Result of GET_CLI_UPDATE_INFO: current version + how/what can be updated. */
export interface CliUpdateInfo {
  /** Currently installed CLI version (from `claude --version`), or null if undetected. */
  cliVersion: string | null;
  packageManager: PackageManager;
  updateMode: UpdateMode;
  /** npm `stable` dist-tag version, or null if the registry lookup failed. */
  stable: string | null;
  /** npm `latest` dist-tag version, or null if the registry lookup failed. */
  latest: string | null;
  /** True when an update is offerable: updateMode != NONE and a newer version exists. */
  updatable: boolean;
}
