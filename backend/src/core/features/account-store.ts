import { readFile, writeFile, rename, unlink, mkdir, chmod, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { randomUUID } from 'crypto';
import { AccountPoolStrategy, type AccountPool, type StoredAccount } from '../../shared';
import { refusedWriteMessage } from './atomic-json';

/**
 * Persistence for saved Claude accounts (the multi-account registry).
 *
 *   ~/.claude-code-gui/accounts.json        — metadata registry (which accounts
 *                                              exist, which one was last active)
 *   ~/.claude-code-gui/accounts/<id>.json   — per-account credential snapshot
 *                                              (raw OAuth blob + oauthAccount), 0600
 *
 * The credential blob is a live OAuth token; snapshot files are written 0600 and
 * NEVER logged. This module only does file I/O — swapping the *live* credential
 * store lives in `live-credentials.ts`, orchestration in `account-manager.ts`.
 */

/** One account's stored credentials + metadata snapshot (the `<id>.json` file). */
export interface AccountSnapshot {
  /** Raw live-credential blob captured for this account (keychain/JSON content). */
  credentials: string;
  /** The `oauthAccount` object from `.claude.json` at capture time, if any. */
  oauthAccount: Record<string, unknown> | null;
}

/** On-disk registry: saved accounts plus a hint of the last switched-to id. */
export interface AccountsRegistry {
  current: string | null;
  accounts: Record<string, StoredAccount>;
  accountPools: AccountPool[];
  /**
   * The order the user arranged accounts in, most recently dragged first-class.
   * Ids missing from this list fall back to registration order behind the ones
   * that are in it, so an untouched registry reads exactly as it always did.
   */
  accountOrder: string[];
}

// Account ids are filesystem-safe (no colon — illegal on Windows) so they can be
// used directly as snapshot filenames. Validated before any path join to block
// traversal from a tampered registry.
const ACCOUNT_ID_PATTERN = /^acc-[a-f0-9-]+$/;
const ACCOUNT_POOL_ID_PATTERN = /^pool-[a-f0-9-]+$/;

function baseDir(): string {
  return join(homedir(), '.claude-code-gui');
}
function registryPath(): string {
  return join(baseDir(), 'accounts.json');
}
function snapshotsDir(): string {
  return join(baseDir(), 'accounts');
}
export function accountSnapshotPath(id: string): string {
  if (!ACCOUNT_ID_PATTERN.test(id)) {
    throw new Error(`Invalid account id: ${id}`);
  }
  return join(snapshotsDir(), `${id}.json`);
}

/** Generate a fresh filesystem-safe account id. */
export function newAccountId(): string {
  return `acc-${randomUUID()}`;
}

/** Generate a fresh filesystem-safe account pool id. */
export function newAccountPoolId(): string {
  return `pool-${randomUUID()}`;
}

async function writeAtomic0600(target: string, content: string): Promise<void> {
  // NOTE: On Windows, POSIX mode 0o600 is not enforced by the filesystem (NTFS
  // ignores the mode bits). Security on Windows relies entirely on the user's ACL.
  // The CLI shares this same limitation and does not apply any Windows-specific ACL
  // hardening either, so our behaviour matches.
  await mkdir(dirname(target), { recursive: true });
  const temp = `${target}.${randomUUID()}.tmp`;
  try {
    await writeFile(temp, content, { encoding: 'utf-8', mode: 0o600 });
    await rename(temp, target);
    await chmod(target, 0o600).catch(() => undefined);
  } finally {
    if (existsSync(temp)) await unlink(temp).catch(() => undefined);
  }
}

// ─── Registry ────────────────────────────────────────────────────────────────

function emptyRegistry(): AccountsRegistry {
  return { current: null, accounts: {}, accountPools: [], accountOrder: [] };
}

/**
 * What a registry read found.
 *
 * `unreadable` is kept apart from an empty registry because the difference
 * decides whether a write may happen. Every writer below adds or removes ONE
 * entry and saves the whole file, so an unreadable registry read as empty turns
 * the next save into "this install has exactly one account" — every other saved
 * account's email, organisation, pool membership and arranged order gone from
 * `accounts.json`. The credential snapshots under `accounts/` would survive on
 * disk with nothing left to name them, which is indistinguishable from losing
 * them. This is the rule `atomic-json.ts` sets out for issue #386, applied to a
 * file that cannot route through `updateJsonFile` because it must be written 0600.
 */
type RegistryReadForUpdate =
  | { status: 'ok'; registry: AccountsRegistry }
  | { status: 'unreadable'; reason: string };

async function readRegistryForUpdate(): Promise<RegistryReadForUpdate> {
  const path = registryPath();
  // Absent is not unreadable: there is nothing to preserve, so the first save
  // creates the file.
  if (!existsSync(path)) return { status: 'ok', registry: emptyRegistry() };

  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(path, 'utf-8'));
  } catch (err) {
    return { status: 'unreadable', reason: err instanceof Error ? err.message : String(err) };
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { status: 'unreadable', reason: 'accounts.json did not contain an object' };
  }

  const parsed = raw as Partial<AccountsRegistry>;
  const accounts = parsed.accounts && typeof parsed.accounts === 'object' ? parsed.accounts : {};
  const accountPools = Array.isArray(parsed.accountPools)
    ? parsed.accountPools.filter(isValidAccountPool)
    : [];
  const accountOrder = Array.isArray(parsed.accountOrder)
    ? parsed.accountOrder.filter((id): id is string => typeof id === 'string' && ACCOUNT_ID_PATTERN.test(id))
    : [];
  return {
    status: 'ok',
    registry: {
      current: typeof parsed.current === 'string' ? parsed.current : null,
      accounts: accounts as Record<string, StoredAccount>,
      accountPools,
      accountOrder,
    },
  };
}

/**
 * Read the registry, returning an empty one when absent or unparseable.
 *
 * Substituting an empty registry is right for a READER — the account list has to
 * render something — and destructive as the read half of a read-modify-write.
 * Writers use `readRegistryForUpdate()` and refuse instead. Unlike before, the
 * failure is logged: a registry that silently read as empty left nothing behind
 * to explain where the accounts went.
 */
export async function readRegistry(): Promise<AccountsRegistry> {
  const read = await readRegistryForUpdate();
  if (read.status === 'unreadable') {
    console.error(
      '[node-backend]',
      `could not read ${registryPath()} (${read.reason}); reporting no saved accounts`,
    );
    return emptyRegistry();
  }
  return read.registry;
}

/** Overwrite the registry (0600; it carries no secrets but stays user-private). */
export async function writeRegistry(registry: AccountsRegistry): Promise<void> {
  await writeAtomic0600(registryPath(), JSON.stringify(registry, null, 2) + '\n');
}

/**
 * Read the registry for a read-modify-write, throwing rather than handing back an
 * empty one when the file exists and could not be read.
 *
 * Throwing is the signal here because every caller already treats a failure as
 * "the save did not happen": the account handlers answer the webview with
 * `status: 'error'`, the best-effort paths (`refreshOutgoingSnapshot`,
 * `persistUsageToRegistry`) swallow it on purpose, and `ws-server` catches
 * anything left. Returning void on a refusal would instead tell the user their
 * account was saved when nothing was written.
 */
async function readRegistryOrRefuse(action: string): Promise<AccountsRegistry> {
  const read = await readRegistryForUpdate();
  if (read.status === 'unreadable') {
    const message = `${refusedWriteMessage(registryPath(), read.reason)} — ${action} was not saved`;
    console.error('[node-backend]', message);
    throw new Error(message);
  }
  return read.registry;
}

/** Insert or update one account's metadata and persist. */
export async function upsertAccount(meta: StoredAccount): Promise<void> {
  const registry = await readRegistryOrRefuse(`account ${meta.id}`);
  registry.accounts[meta.id] = meta;
  await writeRegistry(registry);
}

/** Set the "current" hint and persist. */
export async function setCurrentAccount(id: string | null): Promise<void> {
  const registry = await readRegistryOrRefuse('the active account');
  registry.current = id;
  await writeRegistry(registry);
}

export async function writeAccountPools(accountPools: AccountPool[]): Promise<void> {
  const registry = await readRegistryOrRefuse('the account pools');
  registry.accountPools = normalizeAccountPools(accountPools, registry.accounts);
  await writeRegistry(registry);
}

/** Persist the order the user arranged accounts in, dropping ids we do not know. */
export async function writeAccountOrder(accountOrder: string[]): Promise<void> {
  const registry = await readRegistryOrRefuse('the account order');
  registry.accountOrder = normalizeAccountOrder(accountOrder, registry.accounts);
  await writeRegistry(registry);
}

// ─── Snapshots ───────────────────────────────────────────────────────────────

/** Read one account's credential snapshot, or null when absent/unreadable. */
export async function readSnapshot(id: string): Promise<AccountSnapshot | null> {
  const path = accountSnapshotPath(id);
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(await readFile(path, 'utf-8')) as Partial<AccountSnapshot>;
    if (typeof parsed.credentials !== 'string') return null;
    return {
      credentials: parsed.credentials,
      oauthAccount:
        parsed.oauthAccount && typeof parsed.oauthAccount === 'object'
          ? (parsed.oauthAccount as Record<string, unknown>)
          : null,
    };
  } catch {
    return null;
  }
}

/** Write one account's credential snapshot (0600). */
export async function writeSnapshot(id: string, snapshot: AccountSnapshot): Promise<void> {
  await writeAtomic0600(accountSnapshotPath(id), JSON.stringify(snapshot, null, 2) + '\n');
}

/** Remove an account's metadata entry and its credential snapshot. */
export async function deleteAccountFiles(id: string): Promise<void> {
  const registry = await readRegistryOrRefuse(`the removal of account ${id}`);
  if (registry.accounts[id]) {
    delete registry.accounts[id];
    registry.accountPools = normalizeAccountPools(
      registry.accountPools.map((pool) => ({
        ...pool,
        accountIds: pool.accountIds.filter((accountId) => accountId !== id),
      })),
      registry.accounts,
    );
    registry.accountOrder = registry.accountOrder.filter((accountId) => accountId !== id);
    if (registry.current === id) registry.current = null;
    await writeRegistry(registry);
  }
  await unlink(accountSnapshotPath(id)).catch(() => undefined);
}

/** True when a credential snapshot file exists for the given id. */
export function hasSnapshot(id: string): boolean {
  if (!ACCOUNT_ID_PATTERN.test(id)) return false;
  return existsSync(join(snapshotsDir(), `${id}.json`));
}

/** List snapshot ids actually present on disk (for reconciliation/debugging). */
export async function listSnapshotIds(): Promise<string[]> {
  const dir = snapshotsDir();
  if (!existsSync(dir)) return [];
  try {
    const files = await readdir(dir);
    return files
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.slice(0, -'.json'.length))
      .filter((id) => ACCOUNT_ID_PATTERN.test(id));
  } catch {
    return [];
  }
}

function isValidAccountPool(value: AccountPool): boolean {
  return (
    value &&
    typeof value.id === 'string' &&
    ACCOUNT_POOL_ID_PATTERN.test(value.id) &&
    typeof value.name === 'string' &&
    value.provider === 'claude' &&
    typeof value.enabled === 'boolean' &&
    value.strategy === AccountPoolStrategy.ORDERED &&
    Array.isArray(value.accountIds) &&
    value.accountIds.every((id) => typeof id === 'string' && ACCOUNT_ID_PATTERN.test(id)) &&
    typeof value.createdAt === 'number' &&
    typeof value.updatedAt === 'number'
  );
}

/** Keep only known ids, and only once each, preserving the given order. */
function normalizeAccountOrder(accountOrder: string[], accounts: Record<string, StoredAccount>): string[] {
  const seen = new Set<string>();
  return accountOrder.filter((id) => {
    if (typeof id !== 'string' || !accounts[id] || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function normalizeAccountPools(
  accountPools: AccountPool[],
  accounts: Record<string, StoredAccount>,
): AccountPool[] {
  const assigned = new Set<string>();
  const normalized: AccountPool[] = [];

  for (const pool of accountPools) {
    if (!isValidAccountPool(pool)) continue;
    const accountIds = pool.accountIds.filter((id) => {
      if (!accounts[id] || assigned.has(id)) return false;
      assigned.add(id);
      return true;
    });
    if (accountIds.length < 2) continue;
    normalized.push({ ...pool, accountIds });
  }

  return normalized;
}
