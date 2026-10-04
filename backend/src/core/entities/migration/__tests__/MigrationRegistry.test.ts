import { describe, it, expect } from 'vitest';
import { Migration, MigrationReport } from '../Migration';
import { MigrationEntry, MigrationRegistry } from '../MigrationRegistry';

class Nothing extends Migration {
  async up(): Promise<MigrationReport> {
    return new MigrationReport('nothing');
  }
}

const entry = (name: string) => new MigrationEntry(name, () => new Nothing());

describe('MigrationRegistry', () => {
  it('keeps the migrations in the order given', () => {
    const registry = new MigrationRegistry([entry('20260101000000_first'), entry('20260102000000_second')]);

    expect(registry.entries.map((e) => e.name)).toEqual(['20260101000000_first', '20260102000000_second']);
  });

  it.each([
    ['no timestamp', 'first'],
    ['a short timestamp', '2026010100000_first'],
    ['capital letters', '20260101000000_First'],
    ['underscores in the name', '20260101000000_first_one'],
    ['an empty name', '20260101000000_'],
    ['a trailing dash', '20260101000000_first-'],
  ])('refuses a name with %s', (_why, name) => {
    expect(() => new MigrationRegistry([entry(name)])).toThrow(/not <14-digit timestamp>_<kebab-name>/);
  });

  it('refuses a name that is listed twice', () => {
    expect(() => new MigrationRegistry([entry('20260101000000_first'), entry('20260101000000_first')])).toThrow(
      /unique and in timestamp order/,
    );
  });

  it('refuses names that are not in the order of their timestamps', () => {
    expect(() => new MigrationRegistry([entry('20260102000000_second'), entry('20260101000000_first')])).toThrow(
      /unique and in timestamp order/,
    );
  });

  describe('which are due', () => {
    const registry = new MigrationRegistry([
      entry('20260101000000_first'),
      entry('20260102000000_second'),
      entry('20260103000000_third'),
    ]);

    it('is every one that has no record, in the order they run', () => {
      expect(registry.pendingAgainst(new Set(['20260102000000_second'])).map((e) => e.name)).toEqual([
        '20260101000000_first',
        '20260103000000_third',
      ]);
    });

    it('is all of them for a user who has none recorded', () => {
      expect(registry.pendingAgainst(new Set())).toHaveLength(3);
    });

    it('is none for a user who has all recorded', () => {
      expect(registry.pendingAgainst(new Set(registry.entries.map((e) => e.name)))).toEqual([]);
    });

    // A migration older than the newest one recorded is still due: a branch merged
    // late is not skipped for having an earlier timestamp.
    it('still counts one with an earlier timestamp than a recorded one', () => {
      expect(registry.pendingAgainst(new Set(['20260103000000_third'])).map((e) => e.name)).toEqual([
        '20260101000000_first',
        '20260102000000_second',
      ]);
    });
  });

  describe('what a newer version recorded', () => {
    const registry = new MigrationRegistry([entry('20260101000000_first')]);

    it('names the recorded migrations this version does not have', () => {
      expect(registry.unknownIn(new Set(['20260101000000_first', '20270101000000_later', '20260601000000_mid']))).toEqual([
        '20260601000000_mid',
        '20270101000000_later',
      ]);
    });

    it('is empty when every record is known', () => {
      expect(registry.unknownIn(new Set(['20260101000000_first']))).toEqual([]);
    });
  });
});
