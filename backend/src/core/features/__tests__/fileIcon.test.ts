import { describe, it, expect, vi, beforeEach } from 'vitest';
import { _resetFileIconCache, iconSourceFor, readFileIcon } from '../fileIcon';

beforeEach(() => _resetFileIconCache());

const PNG = { mimeType: 'image/png' as const, base64: 'iVBORw0KGgo=' };

describe('readFileIcon', () => {
  it('gives what the system source gave', async () => {
    const source = vi.fn().mockResolvedValue(PNG);
    expect(await readFileIcon('kts', { platform: 'darwin', source })).toEqual(PNG);
    expect(source).toHaveBeenCalledWith('kts');
  });

  it('asks the system once per extension, whatever the case or how many files share it', async () => {
    const source = vi.fn().mockResolvedValue(PNG);
    await Promise.all([readFileIcon('pdf', { source }), readFileIcon('PDF', { source })]);
    await readFileIcon('pdf', { source });
    expect(source).toHaveBeenCalledTimes(1);
  });

  it.each(['', 'a b', 'x;rm', '../etc', 'a'.repeat(40), '.pdf', "x'y", 'x`y', 'x$(y)'])(
    'refuses "%s" before it reaches a shell or a script',
    async (extension) => {
      const source = vi.fn();
      expect(await readFileIcon(extension, { source })).toBeNull();
      expect(source).not.toHaveBeenCalled();
    },
  );

  it('gives null when the source fails, and asks again next time instead of remembering the failure', async () => {
    const source = vi.fn().mockRejectedValueOnce(new Error('timed out')).mockResolvedValue(PNG);

    expect(await readFileIcon('mov', { source })).toBeNull();
    expect(await readFileIcon('mov', { source })).toEqual(PNG);
  });

  it('remembers an empty answer, which is the system saying it has nothing for the type', async () => {
    const source = vi.fn().mockResolvedValue(null);
    await readFileIcon('weird', { source });
    await readFileIcon('weird', { source });
    expect(source).toHaveBeenCalledTimes(1);
  });

  it('has no way to ask a system nobody wrote one for', async () => {
    expect(await readFileIcon('pdf', { platform: 'freebsd' })).toBeNull();
  });
});

describe('iconSourceFor', () => {
  it.each(['darwin', 'win32', 'linux'] as const)('has a way to ask %s', (platform) => {
    expect(iconSourceFor(platform)).toBeTypeOf('function');
  });

  it.each(['freebsd', 'sunos', 'aix'] as const)('has none for %s', (platform) => {
    expect(iconSourceFor(platform)).toBeUndefined();
  });
});
