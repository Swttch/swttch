import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, realpathSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { ProjectCollection } from '../../project/Project.collection';
import { MigrationFailedError, MigrationGate } from '../MigrationGate';

/** A promise that is settled by hand. */
class Deferred<T> {
  readonly promise: Promise<T>;
  resolve!: (value: T) => void;

  constructor() {
    this.promise = new Promise<T>((resolve) => {
      this.resolve = resolve;
    });
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

describe('MigrationGate', () => {
  const originalCcgHome = process.env.CCG_HOME;
  let home: string;

  beforeEach(() => {
    home = realpathSync(mkdtempSync(join(tmpdir(), 'migration-gate-')));
    process.env.CCG_HOME = home;
    MigrationGate.reset();
  });

  afterEach(() => {
    MigrationGate.reset();
    if (originalCcgHome === undefined) delete process.env.CCG_HOME;
    else process.env.CCG_HOME = originalCcgHome;
    rmSync(home, { recursive: true, force: true });
  });

  describe('the gate itself', () => {
    it('is open before a run has been started', async () => {
      await expect(MigrationGate.ready()).resolves.toBeUndefined();
    });

    it('holds callers back until the run is over, then lets them through', async () => {
      const run = new Deferred<MigrationFailedError | null>();
      MigrationGate.close(run.promise);

      const waiting = MigrationGate.ready();
      expect(await settledSoon(waiting)).toBe(false);

      run.resolve(null);
      await expect(waiting).resolves.toBeUndefined();
    });

    it('fails every caller, now and later, when the run failed', async () => {
      const failure = new MigrationFailedError('20260101000000_first', 'boom');
      MigrationGate.close(Promise.resolve(failure));

      await expect(MigrationGate.ready()).rejects.toBe(failure);
      await expect(MigrationGate.ready()).rejects.toBe(failure);
    });

    it('does not hold back code that runs as a migration, even while it is closed', async () => {
      MigrationGate.close(new Deferred<null>().promise); // never opens

      await expect(MigrationGate.runAsMigration(() => MigrationGate.ready())).resolves.toBeUndefined();
    }, 1_000);

    it('lets the migration\'s own work through across its awaits', async () => {
      MigrationGate.close(new Deferred<null>().promise);

      await MigrationGate.runAsMigration(async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        await Promise.resolve();
        await MigrationGate.ready();
      });
    }, 1_000);

    it('does not let the exemption leak to code outside the migration', async () => {
      MigrationGate.close(new Deferred<null>().promise);
      let outside: Promise<void> | undefined;

      await MigrationGate.runAsMigration(async () => {
        outside = new Promise<void>((resolve) => setTimeout(resolve, 5)).then(() => undefined);
      });
      await outside;

      expect(await settledSoon(MigrationGate.ready())).toBe(false);
    });

    it('goes with the first run only', async () => {
      const first = new Deferred<MigrationFailedError | null>();
      MigrationGate.close(first.promise);
      MigrationGate.close(Promise.resolve(new MigrationFailedError('x', 'ignored')));

      first.resolve(null);

      await expect(MigrationGate.ready()).resolves.toBeUndefined();
    });
  });

  describe('as seen from the entities', () => {
    it('makes a read wait for the run, and then answers', async () => {
      const run = new Deferred<MigrationFailedError | null>();
      MigrationGate.close(run.promise);

      const read = new ProjectCollection().all();
      expect(await settledSoon(read)).toBe(false);

      run.resolve(null);
      await expect(read).resolves.toEqual([]);
    });

    it('makes a write wait for the run, and does not write before it ends', async () => {
      const run = new Deferred<MigrationFailedError | null>();
      MigrationGate.close(run.promise);

      const registered = new ProjectCollection().idOf(join(home, 'app'));
      expect(await settledSoon(registered)).toBe(false);
      MigrationGate.reset();
      expect(await new ProjectCollection().all()).toEqual([]);

      run.resolve(null);
    });

    it('fails a read and a write when the run failed', async () => {
      MigrationGate.close(Promise.resolve(new MigrationFailedError('20260101000000_first', 'boom')));
      const projects = new ProjectCollection();

      await expect(projects.all()).rejects.toBeInstanceOf(MigrationFailedError);
      await expect(projects.idOf(join(home, 'app'))).rejects.toBeInstanceOf(MigrationFailedError);
      await expect(projects.count()).rejects.toBeInstanceOf(MigrationFailedError);
    });

    it('does not hold up the entities a migration uses', async () => {
      MigrationGate.close(new Deferred<null>().promise); // never opens

      const id = await MigrationGate.runAsMigration(() => new ProjectCollection().idOf(join(home, 'app')));

      expect(id).toBe(1);
    }, 1_000);
  });
});
