import { Claude } from '../claude';
import type { AccountListItem, AccountPool, AccountsResult, StoredAccount } from '../../shared';
import {
  readLiveCredentials,
  writeLiveCredentials,
  readLiveOauthAccount,
  writeLiveOauthAccount,
  validateCredentialBlob,
} from './live-credentials';
import {
  readRegistry,
  writeSnapshot,
  readSnapshot,
  upsertAccount,
  setCurrentAccount,
  deleteAccountFiles,
  writeAccountPools,
  writeAccountOrder,
  newAccountId,
} from './account-store';

/**
 * High-level multi-account operations: list / save-current / switch / delete.
 *
 * Built on `live-credentials.ts` (the active credential slot the CLI reads) and
 * `account-store.ts` (per-account snapshots + metadata registry). Switching swaps
 * what lives in the active slot — the CLI has exactly one active credential — and
 * re-snapshots the outgoing account first so refreshed tokens are not lost.
 */

interface ClaudeAuthStatus {
  loggedIn?: boolean;
  authMethod?: string;
  email?: string;
  subscriptionType?: string | null;
  orgName?: string | null;
}

/** Run `claude auth status` for the live account. Null when it fails / not JSON. */
async function runAuthStatus(): Promise<ClaudeAuthStatus | null> {
  try {
    // execAuthed (global context — account management is not project-scoped) so the live
    // account matches what the chat spawn authenticates as; env-provided API keys are kept.
    const { stdout } = await Claude.execAuthed(['auth', 'status', '--json'], undefined, { timeout: 8000 });
    // Extract the JSON object from stdout to guard against shell banner noise
    // (e.g. Windows Console banners, .bashrc printf sequences) that can prefix
    // or suffix the actual JSON output.
    const match = stdout.match(/\{[\s\S]*\}/);
    if (!match) return null;
    return JSON.parse(match[0]) as ClaudeAuthStatus;
  } catch {
    return null;
  }
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

/** Resolve the email of the live CLI account from auth status, else oauthAccount. */
async function resolveLiveEmail(
  authStatus: ClaudeAuthStatus | null,
  oauthAccount: Record<string, unknown> | null,
): Promise<string | null> {
  return str(authStatus?.email) ?? str(oauthAccount?.emailAddress);
}

// ─── List ────────────────────────────────────────────────────────────────────

/**
 * List saved accounts, marking which one is live by matching the active CLI email
 * (source of truth) against each saved account's `emailAddress`.
 */
export async function listAccounts(): Promise<AccountsResult> {
  const registry = await readRegistry();
  const authStatus = await runAuthStatus();
  const liveOauth = authStatus ? null : await readLiveOauthAccount();
  const activeEmail = await resolveLiveEmail(authStatus, liveOauth);

  const accounts: AccountListItem[] = Object.values(registry.accounts).map((meta) => ({
    ...meta,
    active: activeEmail !== null && meta.emailAddress === activeEmail,
  }));
  // The order the user arranged, then registration order (oldest first) for any
  // account they have never moved — so an untouched registry reads as it always
  // did, and a rearranged one keeps the arrangement across restarts.
  const arranged = new Map(registry.accountOrder.map((id, index) => [id, index]));
  accounts.sort((a, b) => {
    const rankA = arranged.get(a.id) ?? Number.MAX_SAFE_INTEGER;
    const rankB = arranged.get(b.id) ?? Number.MAX_SAFE_INTEGER;
    return rankA === rankB ? a.createdAt - b.createdAt : rankA - rankB;
  });

  return { accounts, accountPools: registry.accountPools, activeEmail };
}

/** Replace the saved account order and hand back what was stored. */
export async function updateAccountOrder(accountOrder: string[]): Promise<string[]> {
  await writeAccountOrder(accountOrder);
  const registry = await readRegistry();
  return registry.accountOrder;
}

export async function updateAccountPools(accountPools: AccountPool[]): Promise<AccountPool[]> {
  await writeAccountPools(accountPools);
  const registry = await readRegistry();
  return registry.accountPools;
}

// ─── Save current ──────────────────────────────────────────────────────────────

/**
 * Capture the currently logged-in Claude account into the saved registry. If an
 * account with the same email already exists, its snapshot is refreshed in place
 * (same id, preserved createdAt). Throws when no live account is present.
 */
export async function saveCurrentAccount(): Promise<StoredAccount> {
  const blob = await readLiveCredentials();
  if (!blob) {
    throw new Error('No logged-in Claude account to save. Log in first.');
  }
  validateCredentialBlob(blob);

  const oauthAccount = await readLiveOauthAccount();
  const authStatus = await runAuthStatus();
  const email = await resolveLiveEmail(authStatus, oauthAccount);
  if (!email) {
    throw new Error('Could not determine the account email from Claude.');
  }

  const registry = await readRegistry();
  const existing = Object.values(registry.accounts).find((a) => a.emailAddress === email);
  const now = Date.now();

  const meta: StoredAccount = {
    id: existing?.id ?? newAccountId(),
    emailAddress: email,
    displayName: str(oauthAccount?.displayName),
    organizationName: str(authStatus?.orgName) ?? str(oauthAccount?.organizationName),
    subscriptionType: str(authStatus?.subscriptionType),
    authMethod: str(authStatus?.authMethod),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    usageCached: existing?.usageCached ?? null,
    usageCachedAt: existing?.usageCachedAt ?? 0,
  };

  await writeSnapshot(meta.id, { credentials: blob, oauthAccount });
  await upsertAccount(meta);
  await setCurrentAccount(meta.id);
  return meta;
}

// ─── Switch ─────────────────────────────────────────────────────────────────

/**
 * Re-snapshot the live account before switching away, so token refreshes that
 * happened since it was saved are preserved. Best-effort: matches the live email
 * to a saved account and refreshes that snapshot. Never throws.
 */
async function refreshOutgoingSnapshot(
  liveBlob: string,
  liveOauth: Record<string, unknown> | null,
  excludeId: string,
): Promise<void> {
  try {
    if (!liveBlob) return;
    const authStatus = await runAuthStatus();
    const email = await resolveLiveEmail(authStatus, liveOauth);
    if (!email) return;
    const registry = await readRegistry();
    const match = Object.values(registry.accounts).find(
      (a) => a.emailAddress === email && a.id !== excludeId,
    );
    if (!match) return;
    await writeSnapshot(match.id, { credentials: liveBlob, oauthAccount: liveOauth });
    await upsertAccount({ ...match, updatedAt: Date.now() });
  } catch {
    /* non-fatal: refreshing the outgoing snapshot is best-effort */
  }
}

/**
 * Switch the live CLI credentials to a saved account. Re-snapshots the outgoing
 * account first, then overwrites the live credential slot + oauthAccount metadata.
 * Rolls the live slot back on failure. Throws when the target is unknown/missing.
 */
async function switchToAccountUnlocked(id: string, shouldSwitch: () => boolean = () => true): Promise<StoredAccount> {
  const registry = await readRegistry();
  const target = registry.accounts[id];
  if (!target) {
    throw new Error('Unknown account.');
  }
  const snapshot = await readSnapshot(id);
  if (!snapshot) {
    throw new Error('Saved account credentials are unavailable.');
  }
  validateCredentialBlob(snapshot.credentials);

  // Capture current live state for both the outgoing re-snapshot and rollback.
  const prevBlob = await readLiveCredentials();
  const prevOauth = await readLiveOauthAccount();

  await refreshOutgoingSnapshot(prevBlob, prevOauth, id);

  if (!shouldSwitch()) throw new Error('Account recovery canceled');
  try {
    await writeLiveCredentials(snapshot.credentials);
    if (snapshot.oauthAccount) {
      await writeLiveOauthAccount(snapshot.oauthAccount);
    }
    await setCurrentAccount(id);
    return target;
  } catch (err) {
    // Roll the live slot back to what it was, best-effort.
    try {
      if (prevBlob) await writeLiveCredentials(prevBlob);
      if (prevOauth) await writeLiveOauthAccount(prevOauth);
    } catch {
      /* rollback failed too — surface the original error below */
    }
    throw new Error(
      `Failed to switch account: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

// ─── Delete ─────────────────────────────────────────────────────────────────

/** Remove a saved account's registry entry and credential snapshot. */
export async function deleteAccount(id: string): Promise<void> {
  await deleteAccountFiles(id);
}

// Serialize credential swaps and account-bound process startup in this backend.
let accountOperation: Promise<void> = Promise.resolve();
export function withAccount<T>(id: string, action: () => Promise<T>): Promise<T> {
  const operation = accountOperation.then(async () => {
    const registry = await readRegistry();
    const target = registry.accounts[id];
    if (!target) throw new Error('Saved account no longer exists');
    const live = await readLiveOauthAccount();
    if (registry.current !== id || live?.emailAddress !== target.emailAddress) await switchToAccountUnlocked(id);
    return action();
  });
  accountOperation = operation.then(() => undefined, () => undefined);
  return operation;
}
export function switchToAccount(id: string, shouldSwitch: () => boolean = () => true): Promise<StoredAccount> {
  const operation = accountOperation.then(() => {
    if (!shouldSwitch()) throw new Error('Account recovery canceled');
    return switchToAccountUnlocked(id, shouldSwitch);
  });
  accountOperation = operation.then(() => undefined, () => undefined);
  return operation;
}
