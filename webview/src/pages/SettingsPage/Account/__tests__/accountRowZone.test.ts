import { describe, it, expect } from 'vitest';
import { AccountRowZone, POOL_SPRING_LOAD_MS, accountRowZone } from '../accountPoolLayout';

/**
 * Which band of a row a drag is hovering over. The middle band is what arms a
 * pool preview after a pause; the outer bands are for ordering rows against each
 * other, so a drag merely passing over a row never arms anything.
 */
describe('accountRowZone', () => {
  const top = 100;
  const height = 90; // thirds land on 130 and 160

  it('reads the upper third as the top band', () => {
    expect(accountRowZone(100, top, height)).toBe(AccountRowZone.TOP);
    expect(accountRowZone(129, top, height)).toBe(AccountRowZone.TOP);
  });

  it('reads the middle third as the middle band', () => {
    expect(accountRowZone(130, top, height)).toBe(AccountRowZone.MIDDLE);
    expect(accountRowZone(145, top, height)).toBe(AccountRowZone.MIDDLE);
    expect(accountRowZone(159, top, height)).toBe(AccountRowZone.MIDDLE);
  });

  it('reads the lower third as the bottom band', () => {
    expect(accountRowZone(160, top, height)).toBe(AccountRowZone.BOTTOM);
    expect(accountRowZone(190, top, height)).toBe(AccountRowZone.BOTTOM);
  });

  it('reads a point above the row as the top band and below it as the bottom band', () => {
    expect(accountRowZone(0, top, height)).toBe(AccountRowZone.TOP);
    expect(accountRowZone(500, top, height)).toBe(AccountRowZone.BOTTOM);
  });

  // A row that has not been laid out yet has no bands to divide; treating that
  // as the middle keeps an unmeasurable row from being read as "ordering".
  it('falls back to the middle band for a row with no height', () => {
    expect(accountRowZone(100, top, 0)).toBe(AccountRowZone.MIDDLE);
  });

  it('waits a beat before opening, like a spring-loaded folder', () => {
    expect(POOL_SPRING_LOAD_MS).toBe(1000);
  });
});
