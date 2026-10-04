import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, realpathSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { UnreadFolderCollection } from '../../system/UnreadFolder.collection';
import { Migration, MigrationContext, MigrationReport } from '../Migration';
import { MigrationGate } from '../MigrationGate';
import { MigrationLockTiming } from '../MigrationLock';
import { MigrationEntry, MigrationRegistry } from '../MigrationRegistry';
import { UnreadFolderRetry } from '../UnreadFolderRetry';

const NAME = '20260101000000_first';
const OTHER = '20260102000000_second';

/** A migration whose folders can be made readable one by one. */
class Folders extends Migration {
  readonly asked: string[][] = [];

  constructor(
    readonly unread: Set<string>,
    private readonly throwing = false,
  ) {
    super();
  }

  async up(): Promise<MigrationReport> {
    return new MigrationReport('ok', [...this.unread]);
  }

  async retry(_context: MigrationContext, folders: string[]): Promise<string[]> {
    this.asked.push(folders);
    if (this.throwing) throw new Error('cannot read');
    return folders.filter((folder) => this.unread.has(folder));
  }
}

describe('UnreadFolderRetry', () => {
  const originalCcgHome = process.env.CCG_HOME;
  let home: string;

  beforeEach(() => {
    home = realpathSync(mkdtempSync(join(tmpdir(), 'unread-retry-')));
    process.env.CCG_HOME = home;
    MigrationGate.reset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    MigrationGate.reset();
    vi.restoreAllMocks();
    if (originalCcgHome === undefined) delete process.env.CCG_HOME;
    else process.env.CCG_HOME = originalCcgHome;
    rmSync(home, { recursive: true, force: true });
  });

  const QUICK = new MigrationLockTiming(20, 400, 10, 2_000);
  const remembered = async (...rows: Array<[string, string]>) => {
    for (const [migration, path] of rows) await new UnreadFolderCollection().remember(migration, [path], 1);
  };
  const stored = async () => (await new UnreadFolderCollection().all()).map((row) => [row.migration, row.path]);

  const retryOf = (migrations: Record<string, Migration>, told: string[][] = []) =>
    new UnreadFolderRetry(
      new MigrationRegistry(Object.entries(migrations).map(([name, migration]) => new MigrationEntry(name, () => migration))),
      new MigrationContext(join(home, 'userhome')),
      (paths) => told.push(paths),
      QUICK,
    );

  it('moves the folders that read now, forgets them, and keeps the ones that still do not', async () => {
    const migration = new Folders(new Set(['/b']));
    await remembered([NAME, '/a'], [NAME, '/b']);
    const told: string[][] = [];

    await retryOf({ [NAME]: migration }, told).retryAll();

    expect(migration.asked).toEqual([['/a', '/b']]);
    expect(await stored()).toEqual([[NAME, '/b']]);
    expect(told).toEqual([['/b']]);
  });

  it('tells whoever shows the user that nothing is unread any more', async () => {
    await remembered([NAME, '/a']);
    const told: string[][] = [];

    await retryOf({ [NAME]: new Folders(new Set()) }, told).retryAll();

    expect(told).toEqual([[]]);
  });

  it('asks each migration only about its own folders', async () => {
    const first = new Folders(new Set());
    const second = new Folders(new Set());
    await remembered([NAME, '/a'], [OTHER, '/b']);

    await retryOf({ [NAME]: first, [OTHER]: second }).retryAll();

    expect([first.asked, second.asked]).toEqual([[['/a']], [['/b']]]);
  });

  it('tries only the folder it is asked about', async () => {
    const migration = new Folders(new Set());
    await remembered([NAME, '/a'], [NAME, '/b']);

    await retryOf({ [NAME]: migration }).retryFolder('/b');

    expect(migration.asked).toEqual([['/b']]);
    expect(await stored()).toEqual([[NAME, '/a']]);
  });

  it('does not touch the lock or the migration when the folder is not one that is unread', async () => {
    const migration = new Folders(new Set());
    await remembered([NAME, '/a']);

    await retryOf({ [NAME]: migration }).retryFolder('/somewhere/else');

    expect(migration.asked).toEqual([]);
  });

  it('keeps every folder when the migration throws, and does not throw itself', async () => {
    await remembered([NAME, '/a']);

    await expect(retryOf({ [NAME]: new Folders(new Set(), true) }).retryAll()).resolves.toBeUndefined();

    expect(await stored()).toEqual([[NAME, '/a']]);
  });

  it('leaves alone a folder of a migration this version does not have', async () => {
    await remembered(['20269999000000_from-the-future', '/a']);

    await retryOf({ [NAME]: new Folders(new Set()) }).retryAll();

    expect(await stored()).toEqual([['20269999000000_from-the-future', '/a']]);
  });

  it('lets calls that come at the same moment take turns, so a folder is not moved twice at once', async () => {
    const migration = new Folders(new Set(['/a']));
    await remembered([NAME, '/a']);
    const retry = retryOf({ [NAME]: migration });
    let running = 0;
    let overlapped = false;
    const original = migration.retry.bind(migration);
    vi.spyOn(migration, 'retry').mockImplementation(async (context, folders) => {
      running += 1;
      overlapped ||= running > 1;
      await new Promise((resolve) => setTimeout(resolve, 20));
      running -= 1;
      return original(context, folders);
    });

    await Promise.all([retry.retryAll(), retry.retryAll(), retry.retryFolder('/a')]);

    expect(overlapped).toBe(false);
  });

  it('remembers a folder once however often a migration reports it', async () => {
    await new UnreadFolderCollection().remember(NAME, ['/a', '/a'], 1);
    await new UnreadFolderCollection().remember(NAME, ['/a'], 2);

    expect(await stored()).toEqual([[NAME, '/a']]);
  });
});
