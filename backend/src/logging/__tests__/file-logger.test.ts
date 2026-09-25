import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readdirSync, statSync, writeFileSync, utimesSync, readFileSync } from 'fs';
import { gunzipSync } from 'zlib';
import { tmpdir } from 'os';
import { join } from 'path';
import { FileLogger } from '../file-logger';

/**
 * These cover the failures measured in issue #477, where a developer's log
 * directory held 2.0 GB and its largest file had reached 148 MB against a 50 MB
 * per-file cap.
 */

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ccg-file-logger-test-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env.CCG_HOME;
});

/** Give the write stream a moment to flush and any rotation to settle. */
async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 60));
}

function logFiles(): string[] {
  return readdirSync(dir).filter((name) => /^server(-.+)?\.log(\.gz)?$/.test(name));
}

function totalBytes(): number {
  return logFiles().reduce((sum, name) => sum + statSync(join(dir, name)).size, 0);
}

describe('FileLogger — one active file per process', () => {
  it('names the active file after the pid, so two backends never share one file', async () => {
    const logger = new FileLogger(dir);
    await logger.init();
    logger.write('hello\n');
    await settle();
    await logger.close();

    expect(logFiles()).toContain(`server-${process.pid}.log`);
  });

  it('never writes to the shared server.log that earlier versions used', async () => {
    const logger = new FileLogger(dir);
    await logger.init();
    logger.write('hello\n');
    await settle();
    await logger.close();

    expect(readdirSync(dir)).not.toContain('server.log');
  });
});

describe('FileLogger — the per-file cap is actually enforced', () => {
  it('rotates once the active file passes the limit, keeping the active file small', async () => {
    const maxFileSizeBytes = 4 * 1024;
    const logger = new FileLogger(dir, { maxFileSize: '4K', maxTotalSize: 100 * 1024 * 1024 });
    await logger.init();

    const line = `${'x'.repeat(200)}\n`;
    for (let i = 0; i < 100; i++) logger.write(line);
    await settle();
    await logger.close();

    const active = statSync(join(dir, `server-${process.pid}.log`)).size;
    expect(active).toBeLessThanOrEqual(maxFileSizeBytes * 2);

    const archives = logFiles().filter((name) => name !== `server-${process.pid}.log`);
    expect(archives.length).toBeGreaterThan(0);
  });

  it('puts the pid in the archive name too, so an archive belongs to one writer', async () => {
    const logger = new FileLogger(dir, { maxFileSize: '1K', maxTotalSize: 100 * 1024 * 1024 });
    await logger.init();
    for (let i = 0; i < 40; i++) logger.write(`${'y'.repeat(200)}\n`);
    await settle();
    await logger.close();

    const archives = logFiles().filter((name) => name !== `server-${process.pid}.log`);
    expect(archives.length).toBeGreaterThan(0);
    for (const name of archives) {
      expect(name.startsWith(`server-${process.pid}-`)).toBe(true);
    }
  });
});

describe('FileLogger — the directory cap', () => {
  it('deletes old files until the directory is back under the total limit', async () => {
    const maxTotalSize = 20 * 1024;

    // Files left behind by earlier runs, under both names earlier versions used.
    writeFileSync(join(dir, 'server.log'), 'a'.repeat(15 * 1024));
    writeFileSync(join(dir, 'server-2026-09-24T091600152Z.log'), 'b'.repeat(15 * 1024));

    const logger = new FileLogger(dir, { maxFileSize: '1K', maxTotalSize });
    await logger.init();
    for (let i = 0; i < 20; i++) logger.write(`${'z'.repeat(200)}\n`);
    await settle();
    await logger.close();

    expect(totalBytes()).toBeLessThanOrEqual(maxTotalSize * 2);
  });

  it('reclaims files written by earlier versions, which the old name filter could not see', async () => {
    writeFileSync(join(dir, 'server.log'), 'a'.repeat(30 * 1024));

    const logger = new FileLogger(dir, { maxFileSize: '1K', maxTotalSize: 8 * 1024 });
    await logger.init();
    for (let i = 0; i < 20; i++) logger.write(`${'z'.repeat(200)}\n`);
    await settle();
    await logger.close();

    expect(readdirSync(dir)).not.toContain('server.log');
  });

  it('deletes by age, not by filename — a pid in the name is not an age', async () => {
    const old = join(dir, 'server-111-2026-01-01T000000000Z.log');
    const recent = join(dir, 'server-999-2026-09-24T000000000Z.log');
    writeFileSync(old, 'o'.repeat(10 * 1024));
    writeFileSync(recent, 'r'.repeat(10 * 1024));

    // Sorting by name would put pid 111 and pid 999 in that order by coincidence,
    // so make the ages disagree with the names: the higher pid is the older file.
    const longAgo = new Date('2020-01-01T00:00:00Z');
    const justNow = new Date();
    utimesSync(recent, longAgo, longAgo);
    utimesSync(old, justNow, justNow);

    // The cap is set so that dropping exactly one of the two planted files is
    // enough. Which one goes is the whole assertion: by age it is the 2020 file,
    // by filename it would be the other one.
    const logger = new FileLogger(dir, { maxFileSize: '1K', maxTotalSize: 18 * 1024 });
    await logger.init();
    for (let i = 0; i < 20; i++) logger.write(`${'z'.repeat(200)}\n`);
    await settle();
    await logger.close();

    const remaining = readdirSync(dir);
    expect(remaining).not.toContain('server-999-2026-09-24T000000000Z.log');
    expect(remaining).toContain('server-111-2026-01-01T000000000Z.log');
  });

  it('never deletes the file this process is writing to', async () => {
    writeFileSync(join(dir, 'server-111-2026-01-01T000000000Z.log'), 'o'.repeat(50 * 1024));

    const logger = new FileLogger(dir, { maxFileSize: '512B', maxTotalSize: 1024 });
    await logger.init();
    for (let i = 0; i < 20; i++) logger.write(`${'z'.repeat(200)}\n`);
    await settle();
    await logger.close();

    expect(readdirSync(dir)).toContain(`server-${process.pid}.log`);
  });
});

describe('FileLogger — archives are compressed', () => {
  it('gzips a rotated archive and removes the uncompressed original', async () => {
    const logger = new FileLogger(dir, { maxFileSize: '2K', maxTotalSize: 100 * 1024 * 1024 });
    await logger.init();
    for (let i = 0; i < 60; i++) logger.write(`${'q'.repeat(200)}\n`);
    await settle();
    await settle();
    await logger.close();

    const all = readdirSync(dir);
    const names = logFiles().filter((n) => n !== `server-${process.pid}.log`);
    expect(names.length, `files on disk: ${all.join(', ')}`).toBeGreaterThan(0);
    for (const n of names) {
      expect(n.endsWith('.log.gz'), `files on disk: ${all.join(', ')}`).toBe(true);
    }
  });

  it('makes the archive much smaller than the text it replaces', async () => {
    // Same content written twice, once with compression and once without, so the
    // comparison is between the two archives rather than against a guess.
    const line = `${'compressible text, repeated '.repeat(8)}\n`;

    const plainDir = mkdtempSync(join(tmpdir(), 'ccg-file-logger-plain-'));
    const plain = new FileLogger(plainDir, {
      maxFileSize: '4K',
      maxTotalSize: 100 * 1024 * 1024,
      compress: false,
    });
    await plain.init();
    for (let i = 0; i < 80; i++) plain.write(line);
    await settle();
    await settle();
    await plain.close();

    const gz = new FileLogger(dir, { maxFileSize: '4K', maxTotalSize: 100 * 1024 * 1024 });
    await gz.init();
    for (let i = 0; i < 80; i++) gz.write(line);
    await settle();
    await settle();
    await gz.close();

    const plainArchive = readdirSync(plainDir)
      .filter((n) => n !== `server-${process.pid}.log` && n.endsWith('.log'))
      .map((n) => statSync(join(plainDir, n)).size)
      .reduce((a, b) => a + b, 0);
    const gzArchive = logFiles()
      .filter((n) => n.endsWith('.gz'))
      .map((n) => statSync(join(dir, n)).size)
      .reduce((a, b) => a + b, 0);

    rmSync(plainDir, { recursive: true, force: true });

    expect(plainArchive).toBeGreaterThan(0);
    expect(gzArchive).toBeGreaterThan(0);
    expect(gzArchive).toBeLessThan(plainArchive / 2);
  });

  it('writes real gzip content, not plain text under a .gz name', async () => {
    // The library does not append `.gz` itself — we choose the extension. If the
    // two ever disagree the user gets a file no tool will open, and a size
    // comparison alone would not catch it.
    const logger = new FileLogger(dir, { maxFileSize: '2K', maxTotalSize: 100 * 1024 * 1024 });
    await logger.init();
    for (let i = 0; i < 60; i++) logger.write(`${'q'.repeat(200)}\n`);
    await settle();
    await settle();
    await logger.close();

    const archive = logFiles().find((n) => n.endsWith('.gz'));
    expect(archive).toBeDefined();

    const head = readFileSync(join(dir, archive as string)).subarray(0, 2);
    expect([head[0], head[1]]).toEqual([0x1f, 0x8b]);

    // And it round-trips back to the lines that were written.
    const text = gunzipSync(readFileSync(join(dir, archive as string))).toString('utf8');
    expect(text).toContain('q'.repeat(200));
  });

  it('leaves archives uncompressed when compression is turned off', async () => {
    const logger = new FileLogger(dir, {
      maxFileSize: '2K',
      maxTotalSize: 100 * 1024 * 1024,
      compress: false,
    });
    await logger.init();
    for (let i = 0; i < 60; i++) logger.write(`${'q'.repeat(200)}\n`);
    await settle();
    await logger.close();

    expect(logFiles().some((n) => n.endsWith('.gz'))).toBe(false);
  });

  it('counts compressed archives against the cap, and can delete them', async () => {
    // A .gz left by a previous run must still be visible to the cap; the old name
    // filter would not have matched it at all.
    writeFileSync(join(dir, 'server-111-2020-01-01T000000000Z.log.gz'), 'x'.repeat(30 * 1024));

    const logger = new FileLogger(dir, { maxFileSize: '1K', maxTotalSize: 8 * 1024 });
    await logger.init();
    for (let i = 0; i < 20; i++) logger.write(`${'z'.repeat(200)}\n`);
    await settle();
    await settle();
    await logger.close();

    expect(readdirSync(dir)).not.toContain('server-111-2020-01-01T000000000Z.log.gz');
  });
});

describe('FileLogger — the file-count cap', () => {
  it('sweeps leftovers from previous starts even when nothing is near the size cap', async () => {
    // One tiny file per past backend start. Together they are a few kilobytes, so
    // a size cap alone would never touch them.
    for (let pid = 100; pid < 130; pid++) {
      writeFileSync(join(dir, `server-${pid}.log`), 'tiny\n');
    }

    const logger = new FileLogger(dir, { maxFileCount: 10, maxTotalSize: 100 * 1024 * 1024 });
    await logger.init();
    await settle();
    await logger.close();

    expect(logFiles().length).toBeLessThanOrEqual(10);
  });

  it('sweeps at startup, not only when a rotation happens', async () => {
    for (let pid = 100; pid < 130; pid++) {
      writeFileSync(join(dir, `server-${pid}.log`), 'tiny\n');
    }

    // Nothing is written at all, so no rotation can occur. The sweep has to come
    // from init() or it does not come.
    const logger = new FileLogger(dir, { maxFileCount: 10, maxTotalSize: 100 * 1024 * 1024 });
    await logger.init();
    await settle();
    await logger.close();

    expect(logFiles().length).toBeLessThanOrEqual(10);
  });

  it('keeps the newest files when trimming by count', async () => {
    const oldest = join(dir, 'server-100.log');
    const newest = join(dir, 'server-101.log');
    for (let pid = 100; pid < 130; pid++) {
      writeFileSync(join(dir, `server-${pid}.log`), 'tiny\n');
    }
    // Put the two apart by hours rather than by whichever millisecond the loop
    // finished on — a filesystem with second-resolution mtimes would otherwise
    // make "newest" a coin toss against the 28 files written alongside it.
    const longAgo = new Date('2020-01-01T00:00:00Z');
    utimesSync(oldest, longAgo, longAgo);
    const laterThanAnythingElse = new Date(Date.now() + 3600_000);
    utimesSync(newest, laterThanAnythingElse, laterThanAnythingElse);

    const logger = new FileLogger(dir, { maxFileCount: 10, maxTotalSize: 100 * 1024 * 1024 });
    await logger.init();
    await settle();
    await logger.close();

    const remaining = readdirSync(dir);
    expect(remaining).not.toContain('server-100.log');
    expect(remaining).toContain('server-101.log');
  });
});

describe('FileLogger — CCG_HOME', () => {
  it('writes under CCG_HOME when no directory is passed', async () => {
    process.env.CCG_HOME = dir;

    const logger = new FileLogger();
    await logger.init();
    logger.write('hello\n');
    await settle();
    await logger.close();

    expect(readdirSync(join(dir, 'logs'))).toContain(`server-${process.pid}.log`);
  });

  it('reads CCG_HOME at init, not at import, so a test can set it late', async () => {
    const logger = new FileLogger();
    process.env.CCG_HOME = dir;
    await logger.init();
    logger.write('hello\n');
    await settle();
    await logger.close();

    expect(readdirSync(join(dir, 'logs'))).toContain(`server-${process.pid}.log`);
  });
});
