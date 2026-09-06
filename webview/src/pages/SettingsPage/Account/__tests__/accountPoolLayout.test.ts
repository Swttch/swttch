import { describe, expect, it } from 'vitest';
import { AccountPoolStrategy, type AccountListItem, type AccountPool } from '@/shared';
import {
  AccountDropPosition,
  AccountPoolDropTargetKind,
  applyAccountDrop,
  createOrderedAccountPool,
  deleteAccountPool,
  nextAccountId,
  poolAccounts,
  renameAccountPool,
  removeAccountFromPool,
  standaloneAccounts,
} from '../accountPoolLayout';

function account(id: string): AccountListItem {
  return {
    id,
    emailAddress: `${id}@example.com`,
    displayName: null,
    organizationName: null,
    subscriptionType: 'max',
    authMethod: 'claudeai',
    createdAt: 1,
    updatedAt: 1,
    usageCached: null,
    usageCachedAt: 0,
    active: false,
  };
}

function pool(id: string, accountIds: string[]): AccountPool {
  return {
    id,
    name: id,
    provider: 'claude',
    enabled: true,
    strategy: AccountPoolStrategy.ORDERED,
    accountIds,
    createdAt: 1,
    updatedAt: 1,
  };
}

describe('accountPoolLayout', () => {
  it('separates standalone accounts from pooled accounts', () => {
    const accounts = [account('acc-1'), account('acc-2'), account('acc-3')];

    expect(standaloneAccounts(accounts, [pool('pool-1', ['acc-2'])]).map((a) => a.id)).toEqual([
      'acc-1',
      'acc-3',
    ]);
    expect(poolAccounts(accounts, pool('pool-1', ['acc-3', 'acc-missing', 'acc-1'])).map((a) => a.id)).toEqual([
      'acc-3',
      'acc-1',
    ]);
  });

  it('creates an ordered pool when a standalone account is dropped onto another standalone account', () => {
    const result = applyAccountDrop(
      [],
      'acc-2',
      { kind: AccountPoolDropTargetKind.ACCOUNT, accountId: 'acc-1' },
      () => createOrderedAccountPool('pool-1', 'Account Pool 1', 10),
      10,
    );

    expect(result).toHaveLength(1);
    expect(result[0].accountIds).toEqual(['acc-1', 'acc-2']);
    expect(result[0].strategy).toBe(AccountPoolStrategy.ORDERED);
  });

  it('adds a standalone account after the target account inside an existing pool', () => {
    const result = applyAccountDrop(
      [pool('pool-1', ['acc-1', 'acc-3'])],
      'acc-2',
      { kind: AccountPoolDropTargetKind.ACCOUNT, accountId: 'acc-1' },
      () => createOrderedAccountPool('unused', 'Unused', 10),
      10,
    );

    expect(result[0].accountIds).toEqual(['acc-1', 'acc-2', 'acc-3']);
  });

  // Which side of the target an account lands on is no longer fixed: it comes
  // from the height the drop happened at, so this asks for the near side
  // explicitly. `accountDropPosition.test.ts` covers both sides.
  it('reorders accounts inside the same pool before the target account', () => {
    const result = applyAccountDrop(
      [pool('pool-1', ['acc-1', 'acc-2', 'acc-3'])],
      'acc-3',
      { kind: AccountPoolDropTargetKind.ACCOUNT, accountId: 'acc-1' },
      () => createOrderedAccountPool('unused', 'Unused', 10),
      10,
      AccountDropPosition.BEFORE,
    );

    expect(result[0].accountIds).toEqual(['acc-3', 'acc-1', 'acc-2']);
  });

  it('removes empty or single-account pools when moving accounts out', () => {
    const result = applyAccountDrop(
      [pool('pool-1', ['acc-1', 'acc-2'])],
      'acc-2',
      { kind: AccountPoolDropTargetKind.ACCOUNT, accountId: 'acc-3' },
      () => createOrderedAccountPool('pool-2', 'Account Pool 2', 10),
      10,
    );

    expect(result.map((item) => item.id)).toEqual(['pool-2']);
    expect(result[0].accountIds).toEqual(['acc-3', 'acc-2']);
  });

  it('removes a single account from a pool and deletes whole pools', () => {
    expect(removeAccountFromPool([pool('pool-1', ['acc-1', 'acc-2', 'acc-3'])], 'pool-1', 'acc-2', 10)[0].accountIds).toEqual([
      'acc-1',
      'acc-3',
    ]);
    expect(removeAccountFromPool([pool('pool-1', ['acc-1', 'acc-2'])], 'pool-1', 'acc-2', 10)).toEqual([]);
    expect(deleteAccountPool([pool('pool-1', ['acc-1', 'acc-2'])], 'pool-1')).toEqual([]);
  });

  it('renames a pool without accepting empty names', () => {
    expect(renameAccountPool([pool('pool-1', ['acc-1', 'acc-2'])], 'pool-1', 'Work Pool', 20)[0]).toMatchObject({
      name: 'Work Pool',
      updatedAt: 20,
    });
    expect(renameAccountPool([pool('pool-1', ['acc-1', 'acc-2'])], 'pool-1', '   ', 20)[0].name).toBe('pool-1');
  });

  it('uses the next account in pool order as the visible next target', () => {
    expect(nextAccountId(pool('pool-1', ['acc-1', 'acc-2', 'acc-3']), 'acc-2')).toBe('acc-3');
    expect(nextAccountId(pool('pool-1', ['acc-1', 'acc-2', 'acc-3']), 'acc-3')).toBe('acc-1');
    expect(nextAccountId(pool('pool-1', ['acc-1', 'acc-2']), null)).toBe('acc-1');
  });
});
