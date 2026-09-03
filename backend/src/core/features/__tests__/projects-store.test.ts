import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// The store resolves its path from homedir(), so point that at a scratch
// directory rather than mocking fs — the write path is an atomic temp-file +
// rename that is worth exercising for real.
const home = mkdtempSync(join(tmpdir(), 'ccg-projects-store-'));
vi.mock('os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('os')>();
  return { ...actual, homedir: () => process.env.CCG_TEST_HOME ?? actual.homedir() };
});

import {
  normalizeFavoritePaths,
  readFavoritePaths,
  setProjectFavorite,
} from '../projects-store';

const storeFile = join(home, '.claude-code-gui', 'projects.json');

function writeStore(contents: string): void {
  mkdirSync(join(home, '.claude-code-gui'), { recursive: true });
  writeFileSync(storeFile, contents);
}

function storedPaths(): unknown {
  return JSON.parse(readFileSync(storeFile, 'utf-8')).favoritePaths;
}

describe('projects-store', () => {
  beforeEach(() => {
    process.env.CCG_TEST_HOME = home;
    rmSync(join(home, '.claude-code-gui'), { recursive: true, force: true });
  });

  afterEach(() => {
    delete process.env.CCG_TEST_HOME;
  });

  describe('readFavoritePaths', () => {
    it('reports no pins when the file has never been written', async () => {
      expect(await readFavoritePaths()).toEqual([]);
    });

    it('reads back stored pins', async () => {
      writeStore(JSON.stringify({ favoritePaths: ['/Users/me/app'] }));

      expect(await readFavoritePaths()).toEqual(['/Users/me/app']);
    });

    // Losing the pins is survivable; failing to open the picker is not. This
    // fallback is safe only because the result is displayed, never written back
    // — setProjectFavorite re-reads through updateJsonFile, which refuses.
    it('shows an unpinned list rather than failing on a damaged file', async () => {
      writeStore('{ not json');

      expect(await readFavoritePaths()).toEqual([]);
    });
  });

  describe('setProjectFavorite', () => {
    it('creates the file on the first pin', async () => {
      const result = await setProjectFavorite('/Users/me/app', true);

      expect(result).toEqual({ ok: true, favoritePaths: ['/Users/me/app'] });
      expect(storedPaths()).toEqual(['/Users/me/app']);
    });

    it('appends, keeping the order things were pinned in', async () => {
      await setProjectFavorite('/Users/me/first', true);
      const result = await setProjectFavorite('/Users/me/second', true);

      expect(result.favoritePaths).toEqual(['/Users/me/first', '/Users/me/second']);
    });

    it('removes a pin', async () => {
      writeStore(JSON.stringify({ favoritePaths: ['/Users/me/a', '/Users/me/b'] }));

      const result = await setProjectFavorite('/Users/me/a', false);

      expect(result.favoritePaths).toEqual(['/Users/me/b']);
      expect(storedPaths()).toEqual(['/Users/me/b']);
    });

    it('leaves the file alone when the pin is already in the wanted state', async () => {
      writeStore(JSON.stringify({ favoritePaths: ['/Users/me/app'] }));
      const before = readFileSync(storeFile, 'utf-8');

      expect((await setProjectFavorite('/Users/me/app', true)).favoritePaths).toEqual([
        '/Users/me/app',
      ]);
      expect(readFileSync(storeFile, 'utf-8')).toBe(before);
    });

    // A pin is stored as it was spelled at the time, and the row clicked later
    // can be spelled differently for the same directory.
    it('unpins a Windows path whose case differs from the stored spelling', async () => {
      writeStore(JSON.stringify({ favoritePaths: ['C:\\Users\\Me\\app'] }));

      expect((await setProjectFavorite('c:\\users\\me\\app', false)).favoritePaths).toEqual([]);
    });

    it('unpins the same directory spelled with the other separator', async () => {
      writeStore(JSON.stringify({ favoritePaths: ['C:\\Users\\me\\app'] }));

      expect((await setProjectFavorite('C:/Users/me/app', false)).favoritePaths).toEqual([]);
    });

    it('does not pin the same directory twice under two spellings', async () => {
      writeStore(JSON.stringify({ favoritePaths: ['/Users/me/app'] }));

      expect((await setProjectFavorite('/Users/me/app/', true)).favoritePaths).toEqual([
        '/Users/me/app',
      ]);
    });

    // A shared name prefix is not the same directory.
    it('leaves a sibling alone when unpinning', async () => {
      writeStore(JSON.stringify({ favoritePaths: ['/Users/me/app', '/Users/me/app-backup'] }));

      expect((await setProjectFavorite('/Users/me/app', false)).favoritePaths).toEqual([
        '/Users/me/app-backup',
      ]);
    });

    it('keeps keys written by a version that knew more than this one', async () => {
      writeStore(JSON.stringify({ favoritePaths: [], sortOrder: 'created', groups: { a: 1 } }));

      await setProjectFavorite('/Users/me/app', true);

      const written = JSON.parse(readFileSync(storeFile, 'utf-8'));
      expect(written.sortOrder).toBe('created');
      expect(written.groups).toEqual({ a: 1 });
    });

    // The whole point of routing through updateJsonFile: this call replaces the
    // entire array, so treating a file it could not read as an empty one would
    // turn a failed read into a wiped list of pins (issue #386).
    it('refuses to write over a file it could not read, leaving it untouched', async () => {
      writeStore('{ not json');

      const result = await setProjectFavorite('/Users/me/app', true);

      expect(result.ok).toBe(false);
      expect(readFileSync(storeFile, 'utf-8')).toBe('{ not json');
    });

    it('refuses when the file holds JSON that is not an object', async () => {
      writeStore('["/Users/me/app"]');

      const result = await setProjectFavorite('/Users/me/other', true);

      expect(result.ok).toBe(false);
      expect(readFileSync(storeFile, 'utf-8')).toBe('["/Users/me/app"]');
    });

    it('ignores an empty path rather than storing one', async () => {
      writeStore(JSON.stringify({ favoritePaths: ['/Users/me/app'] }));

      expect((await setProjectFavorite('', true)).favoritePaths).toEqual(['/Users/me/app']);
      expect(storedPaths()).toEqual(['/Users/me/app']);
    });
  });

  describe('normalizeFavoritePaths', () => {
    it.each([
      ['a missing field', undefined],
      ['an object', { a: 1 }],
      ['a string', 'not an array'],
    ])('treats %s as no pins', (_label, value) => {
      expect(normalizeFavoritePaths(value)).toEqual([]);
    });

    it('drops non-string and empty entries', () => {
      expect(normalizeFavoritePaths(['/a', 42, '', null, '/b'])).toEqual(['/a', '/b']);
    });

    // Unpinning removes matches once, so a duplicate would need two clicks.
    it('collapses duplicates, including two spellings of one directory', () => {
      expect(normalizeFavoritePaths(['/a', '/a', '/a/'])).toEqual(['/a']);
    });
  });
});

// Leave nothing behind in the developer's tmp dir.
process.on('exit', () => rmSync(home, { recursive: true, force: true }));
