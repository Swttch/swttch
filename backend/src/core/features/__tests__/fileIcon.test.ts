import { describe, it, expect, vi, beforeEach } from 'vitest';
import { _resetFileIconCache, readFileIcon } from '../fileIcon';

beforeEach(() => _resetFileIconCache());

describe('readFileIcon', () => {
  it('gives the icon the system drew, as a base64 png', async () => {
    const run = vi.fn().mockResolvedValue('iVBORw0KGgo=');
    expect(await readFileIcon('kts', { platform: 'darwin', run })).toEqual({ mimeType: 'image/png', base64: 'iVBORw0KGgo=' });
    expect(run).toHaveBeenCalledWith('kts');
  });

  it('asks the system once per extension, whatever the case or how many files share it', async () => {
    const run = vi.fn().mockResolvedValue('AAA');
    await Promise.all([
      readFileIcon('pdf', { platform: 'darwin', run }),
      readFileIcon('PDF', { platform: 'darwin', run }),
    ]);
    await readFileIcon('pdf', { platform: 'darwin', run });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it.each(['win32', 'linux'] as const)('has no icon to give on %s, where the system cannot be asked cheaply', async (platform) => {
    const run = vi.fn();
    expect(await readFileIcon('pdf', { platform, run })).toBeNull();
    expect(run).not.toHaveBeenCalled();
  });

  it.each(['', 'a b', 'x;rm', '../etc', 'a'.repeat(40), '.pdf'])('refuses "%s" before it reaches a shell', async (extension) => {
    const run = vi.fn();
    expect(await readFileIcon(extension, { platform: 'darwin', run })).toBeNull();
    expect(run).not.toHaveBeenCalled();
  });

  it('gives null when the script fails, and asks again next time instead of remembering the failure', async () => {
    const run = vi.fn().mockRejectedValueOnce(new Error('timed out')).mockResolvedValue('BBB');

    expect(await readFileIcon('mov', { platform: 'darwin', run })).toBeNull();
    expect(await readFileIcon('mov', { platform: 'darwin', run })).toEqual({ mimeType: 'image/png', base64: 'BBB' });
  });

  it('gives null when the script prints nothing', async () => {
    expect(await readFileIcon('mov', { platform: 'darwin', run: async () => '' })).toBeNull();
  });

  it.skipIf(process.platform !== 'darwin')('draws a real png for a real extension on this machine', async () => {
    const icon = await readFileIcon('pdf');
    expect(icon?.mimeType).toBe('image/png');
    // every png starts with these bytes, which base64 writes as iVBORw0KGgo
    expect(icon?.base64.startsWith('iVBORw0KGgo')).toBe(true);
  }, 20_000);
});
