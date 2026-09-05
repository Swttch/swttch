import { describe, it, expect } from 'vitest';
import { AccountDragKind, isLeavingPool, readDragTarget } from '../AccountItem';

/**
 * `isLeavingPool` is the one decision behind two behaviours: the row previews
 * "this drop takes me out of the pool" while dragging, and the drop handler
 * performs the removal. Pinning it here keeps the preview honest — if the rule
 * changes, both change together or this fails.
 *
 * The "no target at all" case is the important one, and it is not a guess: with
 * a real pointer drag the library reports `target: null` the moment the pointer
 * leaves every drop zone, which is what leaving the pool card looks like.
 */
describe('isLeavingPool', () => {
  const poolCard = (poolId: string) => ({ kind: AccountDragKind.POOL, poolId });
  const account = (poolId: string | null) => ({ kind: AccountDragKind.ACCOUNT, poolId });

  it('is false for an account that belongs to no pool, wherever it is dragged', () => {
    expect(isLeavingPool(null, null)).toBe(false);
    expect(isLeavingPool(null, poolCard('pool-a'))).toBe(false);
    expect(isLeavingPool(null, account('pool-a'))).toBe(false);
  });

  it('is true when the drop lands on nothing at all', () => {
    expect(isLeavingPool('pool-a', null)).toBe(true);
  });

  it('is false while still over its own pool card', () => {
    expect(isLeavingPool('pool-a', poolCard('pool-a'))).toBe(false);
  });

  it('is true over another pool card', () => {
    expect(isLeavingPool('pool-a', poolCard('pool-b'))).toBe(true);
  });

  it('is false over any account, because that is a join or reorder instead', () => {
    expect(isLeavingPool('pool-a', account('pool-a'))).toBe(false);
    expect(isLeavingPool('pool-a', account('pool-b'))).toBe(false);
    expect(isLeavingPool('pool-a', account(null))).toBe(false);
  });
});

describe('readDragTarget', () => {
  it('reads an account target', () => {
    expect(readDragTarget({ kind: AccountDragKind.ACCOUNT, accountId: 'acc-1', poolId: 'pool-a' }))
      .toEqual({ kind: AccountDragKind.ACCOUNT, poolId: 'pool-a' });
  });

  it('reads a pool card target', () => {
    expect(readDragTarget({ kind: AccountDragKind.POOL, poolId: 'pool-a' }))
      .toEqual({ kind: AccountDragKind.POOL, poolId: 'pool-a' });
  });

  it('reports a standalone account as belonging to no pool', () => {
    expect(readDragTarget({ kind: AccountDragKind.ACCOUNT, accountId: 'acc-1', poolId: null }))
      .toEqual({ kind: AccountDragKind.ACCOUNT, poolId: null });
  });

  it('returns null for anything that is not one of our drop targets', () => {
    expect(readDragTarget(undefined)).toBeNull();
    expect(readDragTarget(null)).toBeNull();
    expect(readDragTarget({})).toBeNull();
    expect(readDragTarget({ kind: 'something-else' })).toBeNull();
  });
});
