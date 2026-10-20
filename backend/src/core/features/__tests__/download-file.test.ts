import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { downloadToFile } from '../download-file';

describe('downloadToFile', () => {
  let dir: string;
  let destination: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ccg-download-'));
    destination = join(dir, 'cloudflared.exe');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('writes the downloaded bytes to the destination', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('binary-bytes'));

    await downloadToFile('https://example.test/cloudflared.exe', destination, { timeoutMs: 5_000, fetchImpl });

    expect(readFileSync(destination, 'utf8')).toBe('binary-bytes');
    // Nothing half-written is left beside it.
    expect(existsSync(`${destination}.download`)).toBe(false);
  });

  it('follows redirects and gives the fetch a bound on its length', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('x'));

    await downloadToFile('https://example.test/a', destination, { timeoutMs: 5_000, fetchImpl });

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://example.test/a',
      expect.objectContaining({ redirect: 'follow', signal: expect.any(AbortSignal) }),
    );
  });

  it('fails on an HTTP error and leaves nothing behind', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('nope', { status: 404 }));

    await expect(
      downloadToFile('https://example.test/missing', destination, { timeoutMs: 5_000, fetchImpl }),
    ).rejects.toThrow('HTTP 404');

    expect(existsSync(destination)).toBe(false);
    expect(existsSync(`${destination}.download`)).toBe(false);
  });

  it('keeps an installed file when the download fails', async () => {
    writeFileSync(destination, 'installed-before');
    const fetchImpl = vi.fn().mockRejectedValue(new Error('network down'));

    await expect(
      downloadToFile('https://example.test/a', destination, { timeoutMs: 5_000, fetchImpl }),
    ).rejects.toThrow('network down');

    expect(readFileSync(destination, 'utf8')).toBe('installed-before');
  });

  it('does not leave a truncated file when the body breaks half way', async () => {
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('part'));
        controller.error(new Error('connection reset'));
      },
    });
    const fetchImpl = vi.fn().mockResolvedValue(new Response(body));

    await expect(
      downloadToFile('https://example.test/a', destination, { timeoutMs: 5_000, fetchImpl }),
    ).rejects.toThrow();

    expect(existsSync(destination)).toBe(false);
    expect(existsSync(`${destination}.download`)).toBe(false);
  });
});
