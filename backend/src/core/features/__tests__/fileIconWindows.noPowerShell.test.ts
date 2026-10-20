import { describe, it, expect, vi } from 'vitest';

vi.mock('../../win-job', () => ({ isPowerShellUsable: () => false }));

import { readWindowsIcon } from '../fileIconWindows';

describe('readWindowsIcon where PowerShell cannot be launched', () => {
  it('gives no icon, and does not start PowerShell to find that out', async () => {
    const run = vi.fn().mockResolvedValue('iVBORw0KGgo=');

    expect(await readWindowsIcon('pdf', run)).toBeNull();
    expect(run).not.toHaveBeenCalled();
  });
});
