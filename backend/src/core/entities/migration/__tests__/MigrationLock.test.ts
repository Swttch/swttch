import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { MigrationLock, MigrationLockTimeoutError, MigrationLockTiming } from '../MigrationLock';

// Short times, so the waiting that is the point of a lock does not slow the suite.
const QUICK = new MigrationLockTiming(20, 400, 10, 2_000);

describe('MigrationLock', () => {
  let dir: string;
  let lockPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'migration-lock-'));
    lockPath = join(dir, 'nested', '.migrations.lock');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('is a file holding the id of the process that took it', async () => {
    const lock = await MigrationLock.acquire(lockPath, QUICK);

    expect(readFileSync(lockPath, 'utf-8')).toBe(String(process.pid));
    await lock.release();
  });

  it('is gone once released, and releasing twice is harmless', async () => {
    const lock = await MigrationLock.acquire(lockPath, QUICK);

    await lock.release();
    await lock.release();

    expect(existsSync(lockPath)).toBe(false);
  });

  it('makes a second taker wait until the first has released it', async () => {
    const events: string[] = [];
    const first = await MigrationLock.acquire(lockPath, QUICK);

    const second = MigrationLock.acquire(lockPath, QUICK).then(async (lock) => {
      events.push('second has it');
      await lock.release();
    });
    await new Promise((resolve) => setTimeout(resolve, 80));
    events.push('first releases');
    await first.release();
    await second;

    expect(events).toEqual(['first releases', 'second has it']);
  });

  it('lets exactly one of many takers in at a time', async () => {
    let inside = 0;
    let mostInside = 0;
    const take = async () => {
      const lock = await MigrationLock.acquire(lockPath, QUICK);
      inside += 1;
      mostInside = Math.max(mostInside, inside);
      await new Promise((resolve) => setTimeout(resolve, 15));
      inside -= 1;
      await lock.release();
    };

    await Promise.all(Array.from({ length: 6 }, take));

    expect(mostInside).toBe(1);
  });

  it('takes over a lock nobody has touched for longer than the stale time', async () => {
    // A holder that says it is alive only every 100 seconds, then went quiet: as a hung process would.
    const first = await MigrationLock.acquire(lockPath, new MigrationLockTiming(100_000, 400, 10, 2_000));
    const old = new Date(Date.now() - 10_000);
    utimesSync(lockPath, old, old);

    const second = await MigrationLock.acquire(lockPath, QUICK);

    expect(readFileSync(lockPath, 'utf-8')).toBe(String(process.pid));
    await second.release();
    await first.release();
  });

  it('takes over a lock whose process no longer exists, however fresh it is', async () => {
    mkdirSync(join(dir, 'nested'), { recursive: true });
    writeFileSync(lockPath, '2147483646'); // no such process, and the file was just written

    // A stale time far longer than the test: only the missing process can free the lock.
    const lock = await MigrationLock.acquire(lockPath, new MigrationLockTiming(20, 60_000, 10, 500));

    expect(readFileSync(lockPath, 'utf-8')).toBe(String(process.pid));
    await lock.release();
  });

  it('waits for a lock held by a process that exists, and does not take it over while it is fresh', async () => {
    mkdirSync(join(dir, 'nested'), { recursive: true });
    writeFileSync(lockPath, String(process.pid)); // this very process: alive

    await expect(
      MigrationLock.acquire(lockPath, new MigrationLockTiming(20, 10_000, 10, 100)),
    ).rejects.toBeInstanceOf(MigrationLockTimeoutError);
    expect(readFileSync(lockPath, 'utf-8')).toBe(String(process.pid));
  });

  it('keeps a lock that is held for a long time, because the holder keeps touching it', async () => {
    const timing = new MigrationLockTiming(20, 100, 10, 300);
    const first = await MigrationLock.acquire(lockPath, timing);

    // Longer than the stale time: without the heartbeat the second taker would take it over.
    await expect(MigrationLock.acquire(lockPath, timing)).rejects.toBeInstanceOf(MigrationLockTimeoutError);

    expect(readFileSync(lockPath, 'utf-8')).toBe(String(process.pid));
    await first.release();
  });

  it('gives up with a timeout error when the holder does not let go in time', async () => {
    const first = await MigrationLock.acquire(lockPath, QUICK);

    const waiting = MigrationLock.acquire(lockPath, new MigrationLockTiming(20, 400, 10, 120));

    await expect(waiting).rejects.toMatchObject({ name: 'MigrationLockTimeoutError', lockPath });
    await first.release();
  });
});
