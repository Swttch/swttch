import { describe, it, expect, vi } from 'vitest';
import { readWindowsIcon, windowsIconScript } from '../fileIconWindows';

describe('windowsIconScript', () => {
  it('asks Windows about the extension alone, so no file has to exist', () => {
    const script = windowsIconScript('kts');
    expect(script).toContain("SHGetFileInfo('.kts'");
    // SHGFI_ICON | SHGFI_USEFILEATTRIBUTES: answer by the extension's attributes, not by a file on disk
    expect(script).toContain('0x110');
  });

  it('leaves no placeholder behind', () => {
    expect(windowsIconScript('pdf')).not.toContain('$EXTENSION$');
  });

  it('is plain PowerShell that frees the icon handle it was given', () => {
    const script = windowsIconScript('pdf');
    expect(script).toContain('DestroyIcon');
    expect(script).toContain('[Convert]::ToBase64String');
  });

  it('names the extension nowhere but where it belongs', () => {
    expect(windowsIconScript('zzz').match(/zzz/g)).toHaveLength(1);
  });
});

describe('readWindowsIcon', () => {
  it('gives the base64 png the script printed', async () => {
    const run = vi.fn().mockResolvedValue('iVBORw0KGgo=');
    expect(await readWindowsIcon('pdf', run)).toEqual({ mimeType: 'image/png', base64: 'iVBORw0KGgo=' });
    expect(run.mock.calls[0][0]).toContain("'.pdf'");
  });

  it('gives null when the script prints nothing', async () => {
    expect(await readWindowsIcon('pdf', async () => '')).toBeNull();
  });

  it('lets a failure through, for the caller to decide not to remember it', async () => {
    await expect(readWindowsIcon('pdf', async () => { throw new Error('exit 3'); })).rejects.toThrow('exit 3');
  });
});
