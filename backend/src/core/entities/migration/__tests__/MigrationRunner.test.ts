import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { ProjectCollection } from '../../project/Project.collection';
import { SystemMigrationCollection } from '../../system/SystemMigration.collection';
import { SystemMigration } from '../../system/SystemMigration.entity';
import { UnreadFolderCollection } from '../../system/UnreadFolder.collection';
import { Migration, MigrationContext, MigrationReport } from '../Migration';
import { MigrationFailedError, MigrationGate } from '../MigrationGate';
import { MigrationLockTiming } from '../MigrationLock';
import { MigrationEntry, MigrationRegistry } from '../MigrationRegistry';
import { MigrationObserver, MigrationRunResult, MigrationRunner } from '../MigrationRunner';

/** A migration that writes down that it ran, and can be told to fail. */
class Recorded extends Migration {
  constructor(
    private readonly log: string[],
    private readonly name: string,
    private readonly behaviour: { fails?: boolean; unreadable?: string[]; takesMs?: number } = {},
  ) {
    super();
  }

  async up(): Promise<MigrationReport> {
    this.log.push(`start ${this.name}`);
    if (this.behaviour.takesMs) await new Promise((resolve) => setTimeout(resolve, this.behaviour.takesMs));
    if (this.behaviour.fails) throw new Error(`${this.name} broke`);
    this.log.push(`done ${this.name}`);
    return new MigrationReport(`${this.name} summary`, this.behaviour.unreadable ?? []);
  }
}

class Watching extends MigrationObserver {
  readonly events: string[] = [];
  started(due: string[]): void {
    this.events.push(`started ${due.join(',')}`);
  }
  finished(result: MigrationRunResult): void {
    this.events.push(`finished ran=${result.ran.join(',')} failed=${result.failure?.migrationName ?? 'no'}`);
  }
}

const FIRST = '20260101000000_first';
const SECOND = '20260102000000_second';
const THIRD = '20260103000000_third';

// Short times, so a run that has to wait for another does not slow the suite.
const QUICK = new MigrationLockTiming(20, 400, 10, 2_000);

describe('MigrationRunner', () => {
  const originalCcgHome = process.env.CCG_HOME;
  let home: string;
  let log: string[];

  beforeEach(() => {
    home = realpathSync(mkdtempSync(join(tmpdir(), 'migration-runner-')));
    process.env.CCG_HOME = home;
    log = [];
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

  const registryOf = (...entries: Array<[string, ConstructorParameters<typeof Recorded>[2]?]>) =>
    new MigrationRegistry(entries.map(([name, behaviour]) => new MigrationEntry(name, () => new Recorded(log, name, behaviour))));

  const runnerOf = (registry: MigrationRegistry, observer?: MigrationObserver) =>
    new MigrationRunner(registry, '0.34.0', new MigrationContext(join(home, 'userhome')), observer, QUICK);

  const recorded = async () => [...(await new SystemMigrationCollection().all())].map((record) => record.name);

  describe('a run', () => {
    it('does the migrations that are due, one after the other, in the order of their names', async () => {
      const result = await runnerOf(registryOf([FIRST], [SECOND], [THIRD])).run();

      expect(log).toEqual([`start ${FIRST}`, `done ${FIRST}`, `start ${SECOND}`, `done ${SECOND}`, `start ${THIRD}`, `done ${THIRD}`]);
      expect(result.ran).toEqual([FIRST, SECOND, THIRD]);
      expect(result.failure).toBeNull();
      expect(result.didWork).toBe(true);
    });

    it('records each one with the version that ran it, what it did and how long it took', async () => {
      await runnerOf(registryOf([FIRST, { takesMs: 25 }])).run();

      const [record] = await new SystemMigrationCollection().all();
      expect(record).toBeInstanceOf(SystemMigration);
      expect(record).toMatchObject({ name: FIRST, appVersion: '0.34.0', summary: `${FIRST} summary`, projectId: null });
      expect(record.elapsedMs).toBeGreaterThanOrEqual(20);
      expect(record.ranAt).toBeGreaterThan(0);
    });

    it('does not run again what is recorded, so a deleted row stays deleted', async () => {
      const registry = registryOf([FIRST], [SECOND]);
      await runnerOf(registry).run();
      log.length = 0;

      const result = await runnerOf(registry).run();

      expect(log).toEqual([]);
      expect(result.didWork).toBe(false);
      expect(result.failure).toBeNull();
    });

    it('brings a user who skipped versions forward through every migration they lack', async () => {
      await runnerOf(registryOf([FIRST])).run(); // an older version
      log.length = 0;

      const result = await runnerOf(registryOf([FIRST], [SECOND], [THIRD])).run();

      expect(result.ran).toEqual([SECOND, THIRD]);
      expect(await recorded()).toEqual([FIRST, SECOND, THIRD]);
    });

    it('does a migration with an earlier name than a recorded one, as a branch merged late', async () => {
      await runnerOf(registryOf([SECOND])).run();
      log.length = 0;

      const result = await runnerOf(registryOf([FIRST], [SECOND])).run();

      expect(result.ran).toEqual([FIRST]);
    });

    it('does nothing and tells no one when nothing is due', async () => {
      const observer = new Watching();

      const result = await runnerOf(registryOf(), observer).run();

      expect(result.didWork).toBe(false);
      expect(observer.events).toEqual([]);
    });

    it('collects the directories whose old files could not be read', async () => {
      const result = await runnerOf(
        registryOf([FIRST, { unreadable: ['/a'] }], [SECOND, { unreadable: ['/b', '/c'] }]),
      ).run();

      expect(result.unreadable).toEqual(['/a', '/b', '/c']);
    });

    it('remembers each unreadable folder with the migration that could not read it, so it can be read again', async () => {
      await runnerOf(registryOf([FIRST, { unreadable: ['/a'] }], [SECOND, { unreadable: ['/b'] }])).run();

      const rows = (await new UnreadFolderCollection().all()).map((row) => [row.migration, row.path]);
      expect(rows).toEqual([
        [FIRST, '/a'],
        [SECOND, '/b'],
      ]);
    });

    it('remembers nothing when every folder could be read', async () => {
      await runnerOf(registryOf([FIRST])).run();

      expect(await new UnreadFolderCollection().all()).toEqual([]);
    });

    it('lists what is due before running it', async () => {
      const runner = runnerOf(registryOf([FIRST], [SECOND]));
      expect(await runner.due()).toEqual([FIRST, SECOND]);

      await runner.run();

      expect(await runner.due()).toEqual([]);
    });
  });

  describe('a migration that fails', () => {
    it('stops the run there, and the ones after it do not run', async () => {
      const result = await runnerOf(registryOf([FIRST], [SECOND, { fails: true }], [THIRD])).run();

      expect(log).toEqual([`start ${FIRST}`, `done ${FIRST}`, `start ${SECOND}`]);
      expect(result.ran).toEqual([FIRST]);
      expect(result.failure).toBeInstanceOf(MigrationFailedError);
      expect(result.failure).toMatchObject({ migrationName: SECOND, reason: `${SECOND} broke` });
    });

    it('is not recorded, and what ran before it is', async () => {
      await runnerOf(registryOf([FIRST], [SECOND, { fails: true }])).run();

      expect(await recorded()).toEqual([FIRST]);
    });

    it('is tried again at the next run, along with everything after it', async () => {
      await runnerOf(registryOf([FIRST], [SECOND, { fails: true }], [THIRD])).run();
      log.length = 0;

      const result = await runnerOf(registryOf([FIRST], [SECOND], [THIRD])).run();

      expect(log).toEqual([`start ${SECOND}`, `done ${SECOND}`, `start ${THIRD}`, `done ${THIRD}`]);
      expect(result.failure).toBeNull();
      expect(await recorded()).toEqual([FIRST, SECOND, THIRD]);
    });

    it('does not throw: the failure is in the result for the caller to show', async () => {
      await expect(runnerOf(registryOf([FIRST, { fails: true }])).run()).resolves.toBeInstanceOf(MigrationRunResult);
    });

    it('lets go of the lock, so the next run is not held up by it', async () => {
      await runnerOf(registryOf([FIRST, { fails: true }])).run();

      const result = await runnerOf(registryOf([FIRST])).run();

      expect(result.failure).toBeNull();
    });
  });

  describe('records from a newer version', () => {
    it('are left alone and mentioned in the log', async () => {
      await new SystemMigrationCollection().insert(
        SystemMigration.draft('20270101000000_from-the-future', '1.0.0', 1, 1, 'done'),
      );

      const result = await runnerOf(registryOf([FIRST])).run();

      expect(result.ran).toEqual([FIRST]);
      expect(await recorded()).toEqual(['20270101000000_from-the-future', FIRST]);
      expect(console.error).toHaveBeenCalledWith(
        '[node-backend]',
        expect.stringContaining('20270101000000_from-the-future'),
      );
    });
  });

  describe('being told about a run', () => {
    it('hears what is due before it starts and how it ended', async () => {
      const observer = new Watching();

      await runnerOf(registryOf([FIRST], [SECOND]), observer).run();

      expect(observer.events).toEqual([`started ${FIRST},${SECOND}`, `finished ran=${FIRST},${SECOND} failed=no`]);
    });

    it('hears about a failure', async () => {
      const observer = new Watching();

      await runnerOf(registryOf([FIRST], [SECOND, { fails: true }]), observer).run();

      expect(observer.events.at(-1)).toBe(`finished ran=${FIRST} failed=${SECOND}`);
    });
  });

  describe('two processes at once', () => {
    // Several backends share the data directory, and all of them find the same
    // migrations due the first time the new version starts.
    it('runs each migration once, and the one that waited finds the work done', async () => {
      const registry = registryOf([FIRST, { takesMs: 40 }], [SECOND, { takesMs: 40 }]);

      const [a, b] = await Promise.all([runnerOf(registry).run(), runnerOf(registry).run()]);

      expect(log.filter((line) => line.startsWith('start '))).toEqual([`start ${FIRST}`, `start ${SECOND}`]);
      expect(await recorded()).toEqual([FIRST, SECOND]);
      expect([a.ran.length, b.ran.length].sort()).toEqual([0, 2]);
      expect(a.failure).toBeNull();
      expect(b.failure).toBeNull();
    });

    it('fails with a lock failure, and runs nothing, when another process holds the lock for too long', async () => {
      mkdirSync(join(home, 'entities'), { recursive: true });
      writeFileSync(join(home, 'entities', '.migrations.lock'), String(process.pid)); // held, by a live process
      const impatient = new MigrationRunner(
        registryOf([FIRST]),
        '0.34.0',
        new MigrationContext(join(home, 'userhome')),
        undefined,
        new MigrationLockTiming(20, 60_000, 10, 100),
      );

      const result = await impatient.run();

      expect(result.failure?.migrationName).toBe('(lock)');
      expect(log).toEqual([]);
      expect(await recorded()).toEqual([]);
    });
  });

  describe('with the gate that holds requests back', () => {
    // The migrations use the entities, and the gate is closed for the whole run.
    class UsesEntities extends Migration {
      async up(context: MigrationContext): Promise<MigrationReport> {
        const id = await context.projects.idOf(join(home, 'work'));
        return new MigrationReport(`registered project ${id}`);
      }
    }
    const usingEntities = new MigrationRegistry([new MigrationEntry(FIRST, () => new UsesEntities())]);

    it('does not hold up the migration\'s own use of the entities', async () => {
      const runner = runnerOf(usingEntities);
      const run = runner.run();
      MigrationGate.close(run.then((result) => result.failure));

      const result = await run;

      expect(result.ran).toEqual([FIRST]);
      expect(result.failure).toBeNull();
    }, 3_000);

    it('holds a request back until the run is over, and then answers what the run wrote', async () => {
      const runner = runnerOf(usingEntities);
      const run = runner.run();
      MigrationGate.close(run.then((result) => result.failure));

      const request = new ProjectCollection().all();
      const projects = await request;

      expect((await run).didWork).toBe(true);
      expect(projects).toHaveLength(1);
    }, 3_000);

    it('fails a request when the run failed', async () => {
      const runner = runnerOf(registryOf([FIRST, { fails: true }]));
      const run = runner.run();
      MigrationGate.close(run.then((result) => result.failure));

      await expect(new ProjectCollection().all()).rejects.toMatchObject({
        name: 'MigrationFailedError',
        migrationName: FIRST,
      });
    }, 3_000);
  });
});
