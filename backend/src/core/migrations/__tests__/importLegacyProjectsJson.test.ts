import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createHash } from 'crypto';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { MigrationContext } from '../../entities/migration/Migration';
import { ProjectCollection } from '../../entities/project/Project.collection';
import { readFavoritePaths, readProjectMeta } from '../../features/projectPreferences';
import ImportLegacyProjectsJson from '../20261004120100_import-legacy-projects-json';

describe('importing the old projects file', () => {
  const originalCcgHome = process.env.CCG_HOME;
  let root: string;
  let userHome: string;

  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'ccg-import-projects-')));
    userHome = join(root, 'home');
    mkdirSync(join(userHome, '.claude-code-gui'), { recursive: true });
    process.env.CCG_HOME = join(root, 'ccg');
  });

  afterEach(() => {
    if (originalCcgHome === undefined) delete process.env.CCG_HOME;
    else process.env.CCG_HOME = originalCcgHome;
    rmSync(root, { recursive: true, force: true });
  });

  const legacyFile = () => join(userHome, '.claude-code-gui', 'projects.json');
  const plant = (content: unknown) =>
    writeFileSync(legacyFile(), typeof content === 'string' ? content : JSON.stringify(content), 'utf-8');
  const workdir = (name: string) => {
    const path = join(root, 'work', name);
    mkdirSync(path, { recursive: true });
    return path;
  };
  const run = () => new ImportLegacyProjectsJson().up(new MigrationContext(userHome));
  const hash = () => createHash('sha256').update(readFileSync(legacyFile())).digest('hex');

  it('does nothing when there is no old file', async () => {
    const report = await run();

    expect(report.summary).toBe('no old data to move');
    expect(await new ProjectCollection().all()).toEqual([]);
  });

  it('moves the pins in the order they were pinned', async () => {
    const [a, b, c] = [workdir('a'), workdir('b'), workdir('c')];
    plant({ favoritePaths: [b, c, a] });

    const report = await run();

    expect(report.summary).toBe('moved 3 pinned projects, 0 aliases and notes');
    expect(await readFavoritePaths()).toEqual([b, c, a]);
  });

  it('moves aliases and notes, with or without the other half', async () => {
    const [a, b] = [workdir('a'), workdir('b')];
    plant({
      projectMeta: [
        { path: a, name: 'Alpha', description: 'first' },
        { path: b, description: 'only a note' },
      ],
    });

    await run();

    expect(JSON.parse(JSON.stringify(await readProjectMeta()))).toEqual([
      { path: a, name: 'Alpha', description: 'first' },
      { path: b, description: 'only a note' },
    ]);
  });

  it('registers a pinned directory the table has not seen, so the pin is kept', async () => {
    const quiet = workdir('quiet');
    plant({ favoritePaths: [quiet] });

    await run();

    expect(await new ProjectCollection().findByPath(quiet)).not.toBeNull();
  });

  it('registers a directory that is gone from disk too, so its pin and alias are not lost', async () => {
    const gone = join(root, 'work', 'gone');
    plant({ favoritePaths: [gone], projectMeta: [{ path: gone, name: 'Old one' }] });

    await run();

    expect(await readFavoritePaths()).toEqual([gone]);
    expect((await readProjectMeta())[0].name).toBe('Old one');
  });

  it('leaves the old file exactly as it was', async () => {
    plant({ favoritePaths: [workdir('a')], projectMeta: [{ path: workdir('a'), name: 'A' }], other: 'kept' });
    const before = hash();

    await run();

    expect(hash()).toBe(before);
  });

  it('changes nothing when it runs again', async () => {
    const [a, b] = [workdir('a'), workdir('b')];
    plant({ favoritePaths: [a, b], projectMeta: [{ path: a, name: 'Alpha' }] });
    await run();
    const projects = new ProjectCollection();
    const before = await projects.all();

    await run();

    expect(await projects.all()).toEqual(before);
  });

  it('does not overwrite what the project already has', async () => {
    const a = workdir('a');
    plant({ favoritePaths: [a], projectMeta: [{ path: a, name: 'From the file' }] });
    const projects = new ProjectCollection();
    const id = await projects.idOf(a);
    const row = (await projects.find(id))!;
    row.alias = 'Set by the user';
    row.favoritedAt = 5;
    await projects.save(row);

    await run();

    const after = (await projects.find(id))!;
    expect(after.alias).toBe('Set by the user');
    expect(after.favoritedAt).toBe(5);
  });

  it('drops a pin that is listed twice, or is not a path, and an overlay with nothing in it', async () => {
    const a = workdir('a');
    plant({
      favoritePaths: [a, `${a}/`, '', 7, null],
      projectMeta: [{ path: a }, { path: '', name: 'no path' }, 'junk', { path: a, name: '   ' }],
    });

    const report = await run();

    expect(report.summary).toBe('moved 1 pinned projects, 0 aliases and notes');
    expect(await readFavoritePaths()).toEqual([a]);
  });

  it('counts a path that cannot be a project here instead of failing', async () => {
    const a = workdir('a');
    plant({ favoritePaths: ['relative/dir', a] });

    const report = await run();

    expect(report.summary).toBe('moved 1 pinned projects, 0 aliases and notes; skipped 1 unreadable rows');
    expect(await readFavoritePaths()).toEqual([a]);
  });

  it('reports a file that is not JSON and does not fail', async () => {
    plant('{"favoritePaths": [');

    const report = await run();

    expect(report.unreadable).toEqual([legacyFile()]);
    expect(await new ProjectCollection().all()).toEqual([]);
    expect(readFileSync(legacyFile(), 'utf-8')).toBe('{"favoritePaths": [');
  });

  it('reports a file whose root is not an object', async () => {
    plant('["a", "b"]');

    expect((await run()).unreadable).toEqual([legacyFile()]);
  });

  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
    'reports a file it has no permission to read',
    async () => {
      plant({ favoritePaths: [workdir('a')] });
      chmodSync(legacyFile(), 0o000);
      try {
        expect((await run()).unreadable).toEqual([legacyFile()]);
      } finally {
        chmodSync(legacyFile(), 0o600);
      }
    },
  );

  it('treats an empty file as nothing to move', async () => {
    plant('');

    expect((await run()).summary).toBe('no old data to move');
  });
});
