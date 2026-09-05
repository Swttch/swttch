import { describe, it, expect } from 'vitest';
import {
  AccountDropPosition,
  AccountPoolDropTargetKind,
  accountRowHalf,
  applyAccountDrop,
  createOrderedAccountPool,
} from '../accountPoolLayout';

/**
 * Once a row has opened into a pool preview it stops being divided in thirds:
 * the pointer is simply above or below the row's middle, and the dragged account
 * settles on that side. The same side then decides where it actually lands, so
 * what the preview showed is what the drop does.
 */
describe('accountRowHalf', () => {
  const top = 100;
  const height = 80; // midpoint at 140

  it('reads the upper half as landing before the row', () => {
    expect(accountRowHalf(100, top, height)).toBe(AccountDropPosition.BEFORE);
    expect(accountRowHalf(139, top, height)).toBe(AccountDropPosition.BEFORE);
  });

  it('reads the lower half as landing after the row', () => {
    expect(accountRowHalf(140, top, height)).toBe(AccountDropPosition.AFTER);
    expect(accountRowHalf(179, top, height)).toBe(AccountDropPosition.AFTER);
  });

  it('falls back to landing after for a row with no height', () => {
    expect(accountRowHalf(100, top, 0)).toBe(AccountDropPosition.AFTER);
  });
});

describe('applyAccountDrop honours the side the preview showed', () => {
  const createPool = () => createOrderedAccountPool('pool-new', 'Pool', 1);
  const onto = (accountId: string) => ({ kind: AccountPoolDropTargetKind.ACCOUNT, accountId });

  it('pairs two standalone accounts in the order the pointer indicated', () => {
    const before = applyAccountDrop([], 'acc-a', onto('acc-b'), createPool, 2, AccountDropPosition.BEFORE);
    expect(before[0].accountIds).toEqual(['acc-a', 'acc-b']);

    const after = applyAccountDrop([], 'acc-a', onto('acc-b'), createPool, 2, AccountDropPosition.AFTER);
    expect(after[0].accountIds).toEqual(['acc-b', 'acc-a']);
  });

  it('places an account joining an existing pool on the indicated side', () => {
    const pool = { ...createOrderedAccountPool('pool-1', 'Pool', 1), accountIds: ['acc-b', 'acc-c'] };

    const before = applyAccountDrop([pool], 'acc-a', onto('acc-c'), createPool, 2, AccountDropPosition.BEFORE);
    expect(before[0].accountIds).toEqual(['acc-b', 'acc-a', 'acc-c']);

    const after = applyAccountDrop([pool], 'acc-a', onto('acc-c'), createPool, 2, AccountDropPosition.AFTER);
    expect(after[0].accountIds).toEqual(['acc-b', 'acc-c', 'acc-a']);
  });

  it('reorders within one pool on the indicated side', () => {
    const pool = { ...createOrderedAccountPool('pool-1', 'Pool', 1), accountIds: ['acc-a', 'acc-b', 'acc-c'] };

    const before = applyAccountDrop([pool], 'acc-a', onto('acc-c'), createPool, 2, AccountDropPosition.BEFORE);
    expect(before[0].accountIds).toEqual(['acc-b', 'acc-a', 'acc-c']);

    const after = applyAccountDrop([pool], 'acc-a', onto('acc-c'), createPool, 2, AccountDropPosition.AFTER);
    expect(after[0].accountIds).toEqual(['acc-b', 'acc-c', 'acc-a']);
  });
});
