import { readFile, unlink } from 'fs/promises';
import { existsSync, chmodSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { join, dirname } from 'path';
import { homedir, userInfo } from 'os';
import { randomUUID, createHash } from 'crypto';
import { getClaudeConfigDir } from './claudeConfigDir';

const execFileAsync = promisify(execFile);

/**
 * Platform abstraction over Claude Code's *live* credential store — the slot the
 * CLI actually reads when it spawns. Switching accounts means swapping what lives
 * here, because the CLI has exactly one active credential at a time.
 *
 *   macOS         → Keychain generic password, service "Claude Code-credentials",
 *                   account = $USER (what the bundled agent-sdk reads/writes).
 *   Linux/Windows → `<CLAUDE_CONFIG_DIR>/.credentials.json` (0600).
 *
 * Account *metadata* (email, org, display name) lives separately as the
 * `oauthAccount` object inside the global config file `.claude.json`.
 *
 * SECURITY: the credential blob carries a live OAuth token. It is NEVER logged.
 */

const isMac = (): boolean => process.platform === 'darwin';

/**
 * macOS Keychain service name the bundled claude-agent-sdk reads/writes.
 * Mirrors the CLI: bare "Claude Code-credentials" with the default config dir,
 * but suffixed with `-<sha256(configDir)[0:8]>` when CLAUDE_CONFIG_DIR is set.
 */
export function macKeychainService(): string {
  if (!process.env.CLAUDE_CONFIG_DIR) return 'Claude Code-credentials';
  const hash = createHash('sha256').update(getClaudeConfigDir()).digest('hex').substring(0, 8);
  return `Claude Code-credentials-${hash}`;
}

/**
 * macOS Keychain account label, matching the bundled SDK: $USER, then the OS
 * login name, then "claude-code-user". No filtering — the CLI uses $USER verbatim
 * and the value is passed as an execFile arg (never through a shell).
 */
export function macKeychainAccount(): string {
  const envUser = process.env.USER;
  if (envUser) return envUser;
  try {
    const name = userInfo().username;
    if (name) return name;
  } catch {
    /* userInfo can throw on some sandboxes */
  }
  return 'claude-code-user';
}

/**
 * Path of the live credentials file on Linux/Windows. Lives inside the resolved
 * Claude config dir (`CLAUDE_CONFIG_DIR ?? ~/.claude`).
 */
function liveCredentialsFilePath(): string {
  return join(getClaudeConfigDir(), '.credentials.json');
}

/**
 * Path of the global config file `.claude.json` that holds `oauthAccount`. This
 * is the legacy global config: it sits at the homedir root by default, or inside
 * CLAUDE_CONFIG_DIR when that is set (NOT inside the `~/.claude` dir).
 */
function globalConfigFilePath(): string {
  return join(process.env.CLAUDE_CONFIG_DIR ?? homedir(), '.claude.json');
}

// Synchronous on purpose. The backend ends itself from the event loop (a signal
// handler, the idle timer, a restart request), and with no `await` between creating
// the temp file and renaming it, none of those can run in between and leave a copy of
// the login token behind. Only a forced kill or a power cut still can.
function writeAtomic0600(target: string, content: string): void {
  // NOTE: On Windows, POSIX mode 0o600 is not enforced by the filesystem (NTFS
  // ignores the mode bits). Security on Windows relies entirely on the user's ACL.
  // The CLI shares this same limitation and does not apply any Windows-specific ACL
  // hardening either, so our behaviour matches.
  mkdirSync(dirname(target), { recursive: true });
  const temp = `${target}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temp, content, { encoding: 'utf-8', mode: 0o600 });
    renameSync(temp, target);
    // rename may keep the temp file's mode, but be explicit in case it already existed.
    try {
      chmodSync(target, 0o600);
    } catch {
      // The temp file was created 0600 and the rename carried that over.
    }
  } finally {
    // Still there only when the write or the rename failed. `force` makes a missing file no error.
    try {
      rmSync(temp, { force: true });
    } catch {
      // Must not replace the reason the save failed.
    }
  }
}

// ─── Live credentials (the active OAuth blob) ────────────────────────────────

/** Read the live credential blob. Returns '' when nothing is stored. */
export async function readLiveCredentials(): Promise<string> {
  if (isMac()) {
    try {
      const { stdout } = await execFileAsync('/usr/bin/security', [
        'find-generic-password',
        '-a', macKeychainAccount(),
        '-s', macKeychainService(),
        '-w',
      ]);
      return stdout.trim();
    } catch {
      return '';
    }
  }
  const path = liveCredentialsFilePath();
  if (!existsSync(path)) return '';
  return readFile(path, 'utf-8');
}

/** Overwrite the live credential blob with [blob]. */
export async function writeLiveCredentials(blob: string): Promise<void> {
  if (isMac()) {
    // `-U` updates in place. The secret is passed as the `-w` argument: with no
    // value, `security` would prompt on the TTY and a headless process would
    // silently store an EMPTY secret. It is briefly visible to local `ps`, an
    // acceptable trade-off for a credential that already lives in this keychain.
    await execFileAsync('/usr/bin/security', [
      'add-generic-password',
      '-U',
      '-s', macKeychainService(),
      '-a', macKeychainAccount(),
      '-w', blob,
    ]);
    return;
  }
  writeAtomic0600(liveCredentialsFilePath(), blob);
}

/** Remove the live credential blob (used when deleting the active account). */
export async function clearLiveCredentials(): Promise<void> {
  if (isMac()) {
    try {
      await execFileAsync('/usr/bin/security', [
        'delete-generic-password',
        '-a', macKeychainAccount(),
        '-s', macKeychainService(),
      ]);
    } catch (err) {
      // Exit 44 = item not found, which is fine (already absent). Anything else
      // is a real failure. execFile rejects with `code` on the error object.
      const code = (err as { code?: number }).code;
      if (code !== 44) throw err;
    }
    return;
  }
  await unlink(liveCredentialsFilePath()).catch(() => undefined);
}

// ─── Live oauthAccount metadata (inside .claude.json) ────────────────────────

async function readGlobalConfig(): Promise<Record<string, unknown>> {
  const path = globalConfigFilePath();
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(await readFile(path, 'utf-8')) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** Read the live `oauthAccount` object, or null when absent/unreadable. */
export async function readLiveOauthAccount(): Promise<Record<string, unknown> | null> {
  const root = await readGlobalConfig();
  const account = root.oauthAccount;
  return account && typeof account === 'object' && !Array.isArray(account)
    ? (account as Record<string, unknown>)
    : null;
}

/** Replace the live `oauthAccount` object, preserving every other config key. */
export async function writeLiveOauthAccount(oauthAccount: Record<string, unknown>): Promise<void> {
  const root = await readGlobalConfig();
  root.oauthAccount = oauthAccount;
  writeAtomic0600(globalConfigFilePath(), JSON.stringify(root, null, 2) + '\n');
}

/** Remove the live `oauthAccount` object, preserving every other config key. */
export async function removeLiveOauthAccount(): Promise<void> {
  const path = globalConfigFilePath();
  if (!existsSync(path)) return;
  const root = await readGlobalConfig();
  if (!('oauthAccount' in root)) return;
  delete root.oauthAccount;
  writeAtomic0600(path, JSON.stringify(root, null, 2) + '\n');
}

/**
 * Validate that a credential blob is a well-formed Claude OAuth payload (has the
 * `claudeAiOauth` object). Throws on malformed input. Does NOT log the blob.
 */
export function validateCredentialBlob(blob: string): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(blob);
  } catch {
    throw new Error('Claude OAuth credential payload is invalid JSON');
  }
  const obj = parsed as Record<string, unknown> | null;
  if (!obj || typeof obj !== 'object' || typeof obj.claudeAiOauth !== 'object') {
    throw new Error('Claude OAuth credential payload is missing claudeAiOauth');
  }
}
