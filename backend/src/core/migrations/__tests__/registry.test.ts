import { describe, it, expect } from 'vitest';
import { readdirSync } from 'fs';
import { join } from 'path';
import { MIGRATIONS } from '../registry';

/**
 * The backend is one bundle, so the list of migrations is written out in a file
 * and cannot be found by reading the folder at run time. This is what keeps the two
 * from drifting: a migration file that nobody listed would never run.
 */
describe('the list of migrations', () => {
  const folder = join(__dirname, '..');
  const filesInFolder = () =>
    readdirSync(folder)
      .filter((name) => /^\d{14}_.+\.ts$/.test(name))
      .map((name) => name.replace(/\.ts$/, ''))
      .sort();

  it('names every migration file in the folder, and nothing else', () => {
    expect(MIGRATIONS.entries.map((entry) => entry.name)).toEqual(filesInFolder());
  });

  it('is in the order the files sort in, which is the order they run', () => {
    const names = MIGRATIONS.entries.map((entry) => entry.name);

    expect(names).toEqual([...names].sort());
  });

  it('makes each migration without running it', () => {
    for (const entry of MIGRATIONS.entries) expect(entry.create()).toBeDefined();
  });

  it('runs the projects table first, since the imports look inside the projects it holds', () => {
    const names = MIGRATIONS.entries.map((entry) => entry.name.replace(/^\d+_/, ''));

    expect(names.indexOf('create-projects')).toBe(0);
    expect(names.indexOf('import-legacy-projects-json')).toBeLessThan(names.indexOf('import-legacy-prompts'));
  });
});
