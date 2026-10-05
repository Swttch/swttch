import { describe, it, expect, vi } from 'vitest';

vi.mock('child_process', () => ({
  execFile: vi.fn(),
  spawn: vi.fn(() => ({ unref: vi.fn() })),
}));

import { execFile, spawn } from 'child_process';
import { BrowserBridge } from '../browser-bridge';

describe('BrowserBridge.setPrimarySelection', () => {
  it('does nothing and starts no process: a real browser fills the PRIMARY selection by itself', async () => {
    const bridge = new BrowserBridge();

    await expect(
      bridge.setPrimarySelection({ text: 'model', workingDir: '/proj' }),
    ).resolves.toBeUndefined();

    expect(execFile).not.toHaveBeenCalled();
    expect(spawn).not.toHaveBeenCalled();
  });
});
