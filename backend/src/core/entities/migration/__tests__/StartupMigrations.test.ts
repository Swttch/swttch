import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, realpathSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Migration, MigrationContext, MigrationReport } from '../Migration';
import { MigrationFailedError, MigrationGate } from '../MigrationGate';
import { MigrationEntry, MigrationRegistry } from '../MigrationRegistry';
import { MigrationRunResult, MigrationRunner } from '../MigrationRunner';
import { StartupMigrations } from '../StartupMigrations';
import { UnreadFolderRetry } from '../UnreadFolderRetry';
import { ProjectCollection } from '../../project/Project.collection';

const NAME = '20260101000000_first';

class Quick extends Migration {
  runs = 0;
  async up(): Promise<MigrationReport> {
    this.runs += 1;
    return new MigrationReport('ok');
  }
}

/** Fails for the first [failures] runs and then works, as a migration whose cause went away. */
class Flaky extends Migration {
  runs = 0;
  constructor(
    private failures: number,
    /** How long a run that works takes, for a test that has to look at the gate meanwhile. */
    private readonly takesMs = 0,
  ) {
    super();
  }
  async up(): Promise<MigrationReport> {
    this.runs += 1;
    if (this.failures > 0) {
      this.failures -= 1;
      throw new Error('disk busy');
    }
    if (this.takesMs > 0) await new Promise((resolve) => setTimeout(resolve, this.takesMs));
    return new MigrationReport('ok');
  }
}

class Broken extends Migration {
  async up(): Promise<MigrationReport> {
    throw new Error('boom');
  }
}

/** Whether a promise has settled by the time the event loop has turned a few times. */
async function settledSoon(promise: Promise<unknown>): Promise<boolean> {
  let settled = false;
  promise.then(
    () => (settled = true),
    () => (settled = true),
  );
  await new Promise((resolve) => setTimeout(resolve, 40));
  return settled;
}

describe('StartupMigrations', () => {
  const originalCcgHome = process.env.CCG_HOME;
  let home: string;

  beforeEach(() => {
    home = realpathSync(mkdtempSync(join(tmpdir(), 'startup-migrations-')));
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

  const runnerOf = (migration: Migration) =>
    new MigrationRunner(
      new MigrationRegistry([new MigrationEntry(NAME, () => migration)]),
      '0.34.0',
      new MigrationContext(join(home, 'userhome')),
    );

  it('closes the gate as soon as it is made, before anything has run', async () => {
    new StartupMigrations(runnerOf(new Quick()));

    expect(await settledSoon(new ProjectCollection().all())).toBe(false);
  });

  it('opens the gate when the run is done, so the held request is answered', async () => {
    const startup = new StartupMigrations(runnerOf(new Quick()));
    const held = new ProjectCollection().all();

    await startup.start();

    await expect(held).resolves.toEqual([]);
  });

  it('runs the migrations once however often it is started', async () => {
    const migration = new Quick();
    const startup = new StartupMigrations(runnerOf(migration));

    const [first, second] = await Promise.all([startup.start(), startup.start()]);

    expect(migration.runs).toBe(1);
    expect(first).toBe(second);
  });

  it('keeps the gate failing for the rest of the process when a migration failed', async () => {
    const startup = new StartupMigrations(runnerOf(new Broken()));

    const result = await startup.start();

    expect(result.failure?.migrationName).toBe(NAME);
    await expect(new ProjectCollection().all()).rejects.toBeInstanceOf(MigrationFailedError);
  });

  it('holds the entities back all the same when the runner itself throws, which it should never do', async () => {
    const runner = runnerOf(new Quick());
    vi.spyOn(runner, 'run').mockRejectedValue(new Error('bug in the runner'));
    const startup = new StartupMigrations(runner);

    const result = await startup.start();

    expect(result).toBeInstanceOf(MigrationRunResult);
    expect(result.failure).toMatchObject({ migrationName: '(run)', reason: 'bug in the runner' });
    await expect(new ProjectCollection().all()).rejects.toBeInstanceOf(MigrationFailedError);
  });

  describe('the folders an earlier start could not read', () => {
    it('are read again before the due migrations run, and a failure of that does not hold the migrations back', async () => {
      const order: string[] = [];
      const migration = new Quick();
      const runner = runnerOf(migration);
      vi.spyOn(runner, 'run').mockImplementation(async () => {
        order.push('migrations');
        return MigrationRunResult.nothingToDo();
      });
      const retry = new UnreadFolderRetry(new MigrationRegistry([]));
      vi.spyOn(retry, 'retryAll').mockImplementation(async () => {
        order.push('retry');
        throw new Error('could not even try');
      });

      await new StartupMigrations(runner, retry).start();

      expect(order).toEqual(['retry', 'migrations']);
    });
  });

  describe('trying again after a failure, in the same process', () => {
    it('runs the migrations again and opens the gate when they work this time', async () => {
      const migration = new Flaky(1);
      const startup = new StartupMigrations(runnerOf(migration));
      expect((await startup.start()).failure).not.toBeNull();
      await expect(new ProjectCollection().all()).rejects.toBeInstanceOf(MigrationFailedError);

      const result = await startup.retry();

      expect(result?.failure).toBeNull();
      expect(migration.runs).toBe(2);
      await expect(new ProjectCollection().all()).resolves.toEqual([]);
    });

    it('holds the requests that come while it runs, and answers them with what it wrote', async () => {
      const startup = new StartupMigrations(runnerOf(new Flaky(1, 150)));
      await startup.start();

      const retrying = startup.retry();
      const held = new ProjectCollection().all();
      expect(await settledSoon(held)).toBe(false);
      await retrying;

      await expect(held).resolves.toEqual([]);
    });

    it('keeps the gate failing when it fails again, and can be tried once more', async () => {
      const migration = new Flaky(2);
      const startup = new StartupMigrations(runnerOf(migration));
      await startup.start();

      expect((await startup.retry())?.failure?.migrationName).toBe(NAME);
      await expect(new ProjectCollection().all()).rejects.toBeInstanceOf(MigrationFailedError);

      expect((await startup.retry())?.failure).toBeNull();
      await expect(new ProjectCollection().all()).resolves.toEqual([]);
    });

    it('does nothing when no run failed', async () => {
      const migration = new Quick();
      const startup = new StartupMigrations(runnerOf(migration));
      await startup.start();

      expect(await startup.retry()).toBeNull();
      expect(migration.runs).toBe(1);
    });

    it('shares one run between calls that come at the same moment', async () => {
      const migration = new Flaky(1);
      const startup = new StartupMigrations(runnerOf(migration));
      await startup.start();

      await Promise.all([startup.retry(), startup.retry(), startup.retry()]);

      expect(migration.runs).toBe(2);
    });
  });
});
