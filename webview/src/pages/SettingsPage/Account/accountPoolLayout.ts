import { AccountPoolStrategy, type AccountListItem, type AccountPool } from '@/shared';

export enum AccountPoolDropTargetKind {
  ACCOUNT = 'account',
}

export interface AccountPoolDropTarget {
  kind: AccountPoolDropTargetKind;
  accountId: string;
}

/** Where a drag is hovering within a row it is over. */
export enum AccountRowZone {
  TOP = 'top',
  MIDDLE = 'middle',
  BOTTOM = 'bottom',
}

/**
 * How long the pointer must rest in a standalone row's middle band before that
 * row opens into a pool preview. Modelled on the macOS Finder spring-loaded
 * folder: hold over a folder and it opens for you to drop into.
 */
export const POOL_SPRING_LOAD_MS = 1000;

/**
 * Which third of a row the pointer is in.
 *
 * The middle band is what arms pool creation; the outer bands are for ordering
 * rows against each other, so a drag that is merely passing over a row on its
 * way somewhere else never arms anything.
 */
export function accountRowZone(pointerY: number, top: number, height: number): AccountRowZone {
  if (height <= 0) return AccountRowZone.MIDDLE;
  const ratio = (pointerY - top) / height;
  if (ratio < 1 / 3) return AccountRowZone.TOP;
  if (ratio < 2 / 3) return AccountRowZone.MIDDLE;
  return AccountRowZone.BOTTOM;
}

/** Which side of a row a dragged account settles on. */
export enum AccountDropPosition {
  BEFORE = 'before',
  AFTER = 'after',
}

/**
 * Which half of a row the pointer is in.
 *
 * Once a row has opened into a pool preview there is no longer a band that means
 * "arm the preview", so the row splits in two: the pointer is either above the
 * row's middle or below it, and the dragged account sits on that side.
 */
export function accountRowHalf(pointerY: number, top: number, height: number): AccountDropPosition {
  if (height <= 0) return AccountDropPosition.AFTER;
  return pointerY < top + height / 2 ? AccountDropPosition.BEFORE : AccountDropPosition.AFTER;
}

export function standaloneAccounts(
  accounts: AccountListItem[],
  accountPools: AccountPool[],
): AccountListItem[] {
  const pooled = new Set(accountPools.flatMap((pool) => pool.accountIds));
  return accounts.filter((account) => !pooled.has(account.id));
}

export function poolAccounts(
  accounts: AccountListItem[],
  pool: AccountPool,
): AccountListItem[] {
  return pool.accountIds
    .map((id) => accounts.find((account) => account.id === id) ?? null)
    .filter((account): account is AccountListItem => account !== null);
}

export function nextAccountId(pool: AccountPool, activeAccountId: string | null): string | null {
  if (!activeAccountId) return pool.accountIds[0] ?? null;
  const index = pool.accountIds.indexOf(activeAccountId);
  if (index < 0 || pool.accountIds.length < 2) return pool.accountIds[0] ?? null;
  return pool.accountIds[(index + 1) % pool.accountIds.length] ?? null;
}

export function applyAccountDrop(
  accountPools: AccountPool[],
  sourceAccountId: string,
  target: AccountPoolDropTarget,
  createPool: () => AccountPool,
  now: number,
  /** Which side of the target the account lands on, taken from the drop height. */
  position: AccountDropPosition = AccountDropPosition.AFTER,
): AccountPool[] {
  if (sourceAccountId === target.accountId) return accountPools;

  const sourcePool = accountPools.find((pool) => pool.accountIds.includes(sourceAccountId)) ?? null;
  const targetPool = accountPools.find((pool) => pool.accountIds.includes(target.accountId)) ?? null;

  if (sourcePool && targetPool && sourcePool.id === targetPool.id) {
    return accountPools.map((pool) => {
      if (pool.id !== sourcePool.id) return pool;
      return {
        ...pool,
        accountIds: place(pool.accountIds, sourceAccountId, target.accountId, position),
        updatedAt: now,
      };
    });
  }

  const withoutSource = accountPools.map((pool) => ({
    ...pool,
    accountIds: pool.accountIds.filter((id) => id !== sourceAccountId),
  }));

  if (targetPool) {
    return compactPools(
      withoutSource.map((pool) => {
        if (pool.id !== targetPool.id) return pool;
        return {
          ...pool,
          accountIds: place(pool.accountIds, sourceAccountId, target.accountId, position),
          updatedAt: now,
        };
      }),
    );
  }

  const pool = createPool();
  return compactPools([
    ...withoutSource,
    {
      ...pool,
      accountIds: position === AccountDropPosition.BEFORE
        ? [sourceAccountId, target.accountId]
        : [target.accountId, sourceAccountId],
      createdAt: now,
      updatedAt: now,
    },
  ]);
}

export function createOrderedAccountPool(id: string, name: string, now: number): AccountPool {
  return {
    id,
    name,
    provider: 'claude',
    enabled: true,
    strategy: AccountPoolStrategy.ORDERED,
    accountIds: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function removeAccountFromPool(
  accountPools: AccountPool[],
  poolId: string,
  accountId: string,
  now: number,
): AccountPool[] {
  return compactPools(
    accountPools.map((pool) => {
      if (pool.id !== poolId) return pool;
      return {
        ...pool,
        accountIds: pool.accountIds.filter((id) => id !== accountId),
        updatedAt: now,
      };
    }),
  );
}

export function renameAccountPool(
  accountPools: AccountPool[],
  poolId: string,
  name: string,
  now: number,
): AccountPool[] {
  const trimmedName = name.trim();
  if (!trimmedName) return accountPools;
  return accountPools.map((pool) => (
    pool.id === poolId ? { ...pool, name: trimmedName, updatedAt: now } : pool
  ));
}

export function deleteAccountPool(accountPools: AccountPool[], poolId: string): AccountPool[] {
  return accountPools.filter((pool) => pool.id !== poolId);
}

function compactPools(accountPools: AccountPool[]): AccountPool[] {
  return accountPools.filter((pool) => pool.accountIds.length >= 2);
}

/** Put `sourceAccountId` on the given side of `targetAccountId`. */
function place(
  accountIds: string[],
  sourceAccountId: string,
  targetAccountId: string,
  position: AccountDropPosition,
): string[] {
  const withoutSource = accountIds.filter((id) => id !== sourceAccountId);
  const targetIndex = withoutSource.indexOf(targetAccountId);
  if (targetIndex < 0) return [...withoutSource, sourceAccountId];
  const at = position === AccountDropPosition.BEFORE ? targetIndex : targetIndex + 1;
  return [...withoutSource.slice(0, at), sourceAccountId, ...withoutSource.slice(at)];
}
