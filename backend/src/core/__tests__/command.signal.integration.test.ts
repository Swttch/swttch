import { describe, expect, it } from 'vitest';
import { Command } from '../command';

describe('Command exec abort signal', () => {
  it('terminates a running child when aborted', async () => {
    const controller = new AbortController();
    const child = new Command(process.execPath, ['-e', 'setTimeout(() => {}, 10_000)'], {
      timeout: 10_000,
      signal: controller.signal,
    });

    setTimeout(() => controller.abort(), 20);
    await expect(child.exec()).rejects.toThrow(/aborted|canceled|terminated/i);
  });
});
