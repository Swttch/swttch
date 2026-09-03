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
  normalizeProjectMeta,
  readFavoritePaths,
  readProjectMeta,
  setProjectFavorite,
  setProjectMeta,
} from '../projects-store';

const storeFile = join(home, '.claude-code-gui', 'projects.json');

function writeStore(contents: string): void {
  mkdirSync(join(home, '.claude-code-gui'), { recursive: true });
  writeFileSync(storeFile, contents);
}

function storedPaths(): unknown {
  return JSON.parse(readFileSync(storeFile, 'utf-8')).favoritePaths;
}

function storedMeta(): unknown {
  return JSON.parse(readFileSync(storeFile, 'utf-8')).projectMeta;
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

  describe('setProjectMeta', () => {
    it('creates an entry with just a name', async () => {
      const result = await setProjectMeta('/Users/me/app', { name: 'My App' });

      expect(result).toEqual({
        ok: true,
        projectMeta: [{ path: '/Users/me/app', name: 'My App' }],
      });
      expect(storedMeta()).toEqual([{ path: '/Users/me/app', name: 'My App' }]);
    });

    it('creates an entry with just a description', async () => {
      const result = await setProjectMeta('/Users/me/app', { description: 'The internal tool' });

      expect(result.projectMeta).toEqual([
        { path: '/Users/me/app', description: 'The internal tool' },
      ]);
    });

    it('stores both fields together', async () => {
      const result = await setProjectMeta('/Users/me/app', {
        name: 'My App',
        description: 'The internal tool',
      });

      expect(result.projectMeta).toEqual([
        { path: '/Users/me/app', name: 'My App', description: 'The internal tool' },
      ]);
    });

    it('trims surrounding whitespace on both fields', async () => {
      const result = await setProjectMeta('/Users/me/app', {
        name: '  My App  ',
        description: '  notes  ',
      });

      expect(result.projectMeta).toEqual([
        { path: '/Users/me/app', name: 'My App', description: 'notes' },
      ]);
    });

    it('updates an existing entry rather than duplicating it', async () => {
      writeStore(JSON.stringify({ projectMeta: [{ path: '/Users/me/app', name: 'Old Name' }] }));

      const result = await setProjectMeta('/Users/me/app', { name: 'New Name' });

      expect(result.projectMeta).toEqual([{ path: '/Users/me/app', name: 'New Name' }]);
    });

    // Clearing both fields removes the entry rather than leaving an empty
    // shell — there is nothing left worth remembering about that path.
    it('removes the entry once both fields are cleared', async () => {
      writeStore(
        JSON.stringify({
          projectMeta: [{ path: '/Users/me/app', name: 'My App', description: 'notes' }],
        }),
      );

      const result = await setProjectMeta('/Users/me/app', { name: '', description: '' });

      expect(result.projectMeta).toEqual([]);
      expect(storedMeta()).toEqual([]);
    });

    // A blank name with a kept description is a real, partial edit — clearing
    // the alias while keeping the note, not an all-or-nothing reset.
    it('clears just the name while keeping the description', async () => {
      writeStore(
        JSON.stringify({
          projectMeta: [{ path: '/Users/me/app', name: 'My App', description: 'notes' }],
        }),
      );

      const result = await setProjectMeta('/Users/me/app', { name: '', description: 'notes' });

      expect(result.projectMeta).toEqual([{ path: '/Users/me/app', description: 'notes' }]);
    });

    it('leaves other projects untouched', async () => {
      writeStore(
        JSON.stringify({
          projectMeta: [{ path: '/Users/me/other', name: 'Other' }],
        }),
      );

      const result = await setProjectMeta('/Users/me/app', { name: 'My App' });

      expect(result.projectMeta).toEqual([
        { path: '/Users/me/other', name: 'Other' },
        { path: '/Users/me/app', name: 'My App' },
      ]);
    });

    it('does not rewrite the file when nothing actually changed', async () => {
      writeStore(
        JSON.stringify({ projectMeta: [{ path: '/Users/me/app', name: 'My App' }] }),
      );
      const before = readFileSync(storeFile, 'utf-8');

      await setProjectMeta('/Users/me/app', { name: 'My App' });

      expect(readFileSync(storeFile, 'utf-8')).toBe(before);
    });

    it('does not create a file for a no-op clear on a project with no entry', async () => {
      const result = await setProjectMeta('/Users/me/app', { name: '', description: '' });

      expect(result.projectMeta).toEqual([]);
    });

    // Same reasoning as setProjectFavorite: this replaces the whole array, so
    // treating an unreadable file as empty would wipe every alias on a read
    // failure (issue #386).
    it('refuses to write over a file it could not read', async () => {
      writeStore('{ not json');

      const result = await setProjectMeta('/Users/me/app', { name: 'My App' });

      expect(result.ok).toBe(false);
      expect(readFileSync(storeFile, 'utf-8')).toBe('{ not json');
    });

    it('matches an existing entry across a different path spelling', async () => {
      writeStore(
        JSON.stringify({ projectMeta: [{ path: 'C:\\Users\\Me\\app', name: 'My App' }] }),
      );

      const result = await setProjectMeta('c:\\users\\me\\app', { name: '', description: '' });

      expect(result.projectMeta).toEqual([]);
    });
  });

  describe('readProjectMeta', () => {
    it('reports nothing when the file has never been written', async () => {
      expect(await readProjectMeta()).toEqual([]);
    });

    it('shows an empty overlay rather than failing on a damaged file', async () => {
      writeStore('{ not json');

      expect(await readProjectMeta()).toEqual([]);
    });
  });

  describe('normalizeProjectMeta', () => {
    it.each([
      ['a missing field', undefined],
      ['an object', { a: 1 }],
      ['a string', 'not an array'],
    ])('treats %s as no overlay', (_label, value) => {
      expect(normalizeProjectMeta(value)).toEqual([]);
    });

    it('drops entries missing a usable path', () => {
      expect(normalizeProjectMeta([{ name: 'No path' }, 42, null])).toEqual([]);
    });

    it('drops entries with neither name nor description', () => {
      expect(normalizeProjectMeta([{ path: '/a' }])).toEqual([]);
    });

    it('trims whitespace-only fields down to nothing', () => {
      expect(normalizeProjectMeta([{ path: '/a', name: '   ', description: '   ' }])).toEqual([]);
    });

    // The first occurrence wins so a damaged file cannot show two different
    // aliases for the same directory.
    it('keeps only the first entry for a duplicated path', () => {
      expect(
        normalizeProjectMeta([
          { path: '/a', name: 'First' },
          { path: '/a', name: 'Second' },
        ]),
      ).toEqual([{ path: '/a', name: 'First' }]);
    });
  });
});

// Leave nothing behind in the developer's tmp dir.
process.on('exit', () => rmSync(home, { recursive: true, force: true }));
