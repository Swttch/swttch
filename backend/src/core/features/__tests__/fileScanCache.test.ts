import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { appendFile, mkdtemp, rm, utimes, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { createFileScanCache } from '../fileScanCache';

/**
 * A transcript is only ever appended to, so what was read from it is still right while its size and its
 * modification time are the same. A list that reads hundreds of transcripts every time it is asked for
 * reads the ones that changed, and no others.
 */
describe('createFileScanCache', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'file-scan-cache-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  async function file(content = 'a\n'): Promise<string> {
    const path = join(dir, `t-${Math.random().toString(36).slice(2)}.jsonl`);
    await writeFile(path, content);
    return path;
  }

  it('reads a file once while it stays as it is', async () => {
    const cached = createFileScanCache();
    const path = await file();
    const scan = vi.fn().mockResolvedValue('value');

    expect(await cached('head', path, scan)).toBe('value');
    expect(await cached('head', path, scan)).toBe('value');
    expect(await cached('head', path, scan)).toBe('value');

    expect(scan).toHaveBeenCalledTimes(1);
  });

  it('reads the file again when it grew', async () => {
    const cached = createFileScanCache();
    const path = await file();
    const scan = vi.fn().mockResolvedValueOnce('before').mockResolvedValueOnce('after');

    expect(await cached('head', path, scan)).toBe('before');
    await appendFile(path, 'more\n');

    expect(await cached('head', path, scan)).toBe('after');
    expect(scan).toHaveBeenCalledTimes(2);
  });

  it('reads the file again when its modification time changed, though its size did not', async () => {
    const cached = createFileScanCache();
    const path = await file();
    const scan = vi.fn().mockResolvedValueOnce('before').mockResolvedValueOnce('after');

    await cached('head', path, scan);
    const later = new Date(Date.now() + 5_000);
    await utimes(path, later, later);

    expect(await cached('head', path, scan)).toBe('after');
  });

  it('keeps what was read for each kind of reading apart', async () => {
    const cached = createFileScanCache();
    const path = await file();

    expect(await cached('head', path, async () => 'head value')).toBe('head value');
    expect(await cached('tail', path, async () => 'tail value')).toBe('tail value');
    expect(await cached('head', path, async () => 'never read')).toBe('head value');
  });

  it('keeps what was read for each file apart', async () => {
    const cached = createFileScanCache();
    const a = await file('a\n');
    const b = await file('bb\n');

    expect(await cached('head', a, async () => 'a')).toBe('a');
    expect(await cached('head', b, async () => 'b')).toBe('b');
  });

  it('lets the reading fail as it does without the cache when the file cannot be looked at', async () => {
    const cached = createFileScanCache();
    const scan = vi.fn().mockRejectedValue(new Error('ENOENT'));

    await expect(cached('head', join(dir, 'missing.jsonl'), scan)).rejects.toThrow('ENOENT');
    await expect(cached('head', join(dir, 'missing.jsonl'), scan)).rejects.toThrow('ENOENT');
    expect(scan).toHaveBeenCalledTimes(2);
  });

  it('does not keep a failed reading', async () => {
    const cached = createFileScanCache();
    const path = await file();
    const scan = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce('fine');

    await expect(cached('head', path, scan)).rejects.toThrow('boom');
    expect(await cached('head', path, scan)).toBe('fine');
  });

  it('forgets the file that was looked at longest ago when it holds too many', async () => {
    const cached = createFileScanCache(2);
    const [a, b, c] = [await file('1\n'), await file('2\n'), await file('3\n')];
    const scan = vi.fn(async () => 'v');

    await cached('head', a, scan);
    await cached('head', b, scan);
    await cached('head', a, scan); // a is the newest now
    await cached('head', c, scan); // b goes
    expect(scan).toHaveBeenCalledTimes(3);

    await cached('head', a, scan);
    await cached('head', c, scan);
    expect(scan).toHaveBeenCalledTimes(3);
    await cached('head', b, scan);
    expect(scan).toHaveBeenCalledTimes(4);
  });
});
