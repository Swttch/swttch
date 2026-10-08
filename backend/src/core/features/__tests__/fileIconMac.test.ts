import { describe, it, expect, vi } from 'vitest';
import { readMacIcon } from '../fileIconMac';

describe('readMacIcon', () => {
  it('gives the base64 png the script printed', async () => {
    const run = vi.fn().mockResolvedValue('iVBORw0KGgo=');
    expect(await readMacIcon('kts', run)).toEqual({ mimeType: 'image/png', base64: 'iVBORw0KGgo=' });
    expect(run).toHaveBeenCalledWith('kts');
  });

  it('gives null when the script prints nothing', async () => {
    expect(await readMacIcon('mov', async () => '')).toBeNull();
  });

  it('lets a failure through, for the caller to decide not to remember it', async () => {
    await expect(readMacIcon('mov', async () => { throw new Error('timed out'); })).rejects.toThrow('timed out');
  });

  it.skipIf(process.platform !== 'darwin')('draws a real png for a real extension on this machine', async () => {
    const icon = await readMacIcon('pdf');
    expect(icon?.mimeType).toBe('image/png');
    // every png starts with these bytes, which base64 writes as iVBORw0KGgo
    expect(icon?.base64.startsWith('iVBORw0KGgo')).toBe(true);
  }, 20_000);
});
