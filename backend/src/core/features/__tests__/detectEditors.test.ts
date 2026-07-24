import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const resolveMacApp = vi.fn();
const resolveLinuxApp = vi.fn();
const resolveWindowsApp = vi.fn();

vi.mock('../appDetection/resolveApp', () => ({
  resolveMacApp: (...args: unknown[]) => resolveMacApp(...args),
  resolveLinuxApp: (...args: unknown[]) => resolveLinuxApp(...args),
}));
vi.mock('../appDetection/resolveWindows', () => ({
  resolveWindowsApp: (...args: unknown[]) => resolveWindowsApp(...args),
}));

const originalPlatform = process.platform;
function setPlatform(platform: NodeJS.Platform) {
  Object.defineProperty(process, 'platform', { value: platform, configurable: true });
}

beforeEach(() => {
  vi.resetModules();
  resolveMacApp.mockReset();
  resolveLinuxApp.mockReset();
  resolveWindowsApp.mockReset();
});

afterEach(() => setPlatform(originalPlatform));

describe('detectInstalledEditors', () => {
  it('macOS: maps catalog entries to { id, name, path } for editors that resolve', async () => {
    setPlatform('darwin');
    resolveMacApp.mockImplementation((mac: { bundleIds: string[] }) =>
      Promise.resolve(
        mac.bundleIds.includes('com.jetbrains.WebStorm')
          ? '/Applications/WebStorm.app'
          : null,
      ),
    );

    const { detectInstalledEditors } = await import('../detectEditors');
    const editors = await detectInstalledEditors();

    expect(editors).toEqual([
      { id: 'webstorm', name: 'WebStorm', path: '/Applications/WebStorm.app' },
    ]);
  });

  it('returns an empty array when nothing resolves', async () => {
    setPlatform('darwin');
    resolveMacApp.mockResolvedValue(null);

    const { detectInstalledEditors } = await import('../detectEditors');
    expect(await detectInstalledEditors()).toEqual([]);
  });

  it('every returned entry has the expected string shape', async () => {
    setPlatform('darwin');
    resolveMacApp.mockImplementation((mac: { bundleIds: string[] }) =>
      Promise.resolve(
        mac.bundleIds.includes('com.microsoft.VSCode')
          ? '/Applications/Visual Studio Code.app'
          : null,
      ),
    );

    const { detectInstalledEditors } = await import('../detectEditors');
    const editors = await detectInstalledEditors();

    expect(editors.length).toBeGreaterThan(0);
    for (const editor of editors) {
      expect(typeof editor.id).toBe('string');
      expect(typeof editor.name).toBe('string');
      expect(typeof editor.path).toBe('string');
      expect(editor.path.length).toBeGreaterThan(0);
    }
  });

  it('skips catalog entries with no descriptor for the current platform', async () => {
    // Linux: entries that only define mac/win detection are skipped, and only
    // resolved linux binaries come through.
    setPlatform('linux');
    resolveLinuxApp.mockImplementation((linux: { binaries: string[] }) =>
      Promise.resolve(linux.binaries.includes('code') ? '/usr/bin/code' : null),
    );

    const { detectInstalledEditors } = await import('../detectEditors');
    const editors = await detectInstalledEditors();

    expect(editors.map((e) => e.name)).toContain('Visual Studio Code');
    expect(editors.every((e) => e.path.length > 0)).toBe(true);
  });
});
