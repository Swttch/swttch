import { describe, it, expect, vi } from 'vitest';

vi.mock('child_process', () => ({
  execFile: vi.fn(),
  spawn: vi.fn(() => ({ unref: vi.fn() })),
}));

import { execFile, spawn } from 'child_process';
import { BrowserBridge } from '../browser-bridge';

describe('BrowserBridge.getClipboard', () => {
  it('answers with nothing and starts no process: a real browser reads its own clipboard', async () => {
    const bridge = new BrowserBridge();

    await expect(bridge.getClipboard({ workingDir: '/proj' })).resolves.toEqual({
      text: null,
      image: null,
    });

    expect(execFile).not.toHaveBeenCalled();
    expect(spawn).not.toHaveBeenCalled();
  });
});
