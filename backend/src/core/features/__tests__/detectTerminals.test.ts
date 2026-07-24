import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const resolveMacApp = vi.fn();
const resolveLinuxApp = vi.fn();
const resolveWindowsPath = vi.fn();

vi.mock('../appDetection/resolveApp', () => ({
  resolveMacApp: (...args: unknown[]) => resolveMacApp(...args),
  resolveLinuxApp: (...args: unknown[]) => resolveLinuxApp(...args),
  resolveWindowsPath: (...args: unknown[]) => resolveWindowsPath(...args),
}));

const originalPlatform = process.platform;
function setPlatform(platform: NodeJS.Platform) {
  Object.defineProperty(process, 'platform', { value: platform, configurable: true });
}

beforeEach(() => {
  vi.resetModules();
  resolveMacApp.mockReset();
  resolveLinuxApp.mockReset();
  resolveWindowsPath.mockReset();
});

afterEach(() => setPlatform(originalPlatform));

describe('detectInstalledTerminals', () => {
  it('macOS: detects installed terminals with Terminal first as the default', async () => {
    setPlatform('darwin');
    resolveMacApp.mockImplementation((mac: { bundleIds: string[] }) => {
      if (mac.bundleIds.includes('com.apple.Terminal')) {
        return Promise.resolve('/System/Applications/Utilities/Terminal.app');
      }
      if (mac.bundleIds.includes('com.googlecode.iterm2')) {
        return Promise.resolve('/Applications/iTerm.app');
      }
      return Promise.resolve(null);
    });

    const { detectInstalledTerminals } = await import('../detectTerminals');
    const terminals = await detectInstalledTerminals();

    expect(terminals[0]).toMatchObject({ name: 'Terminal', isDefault: true });
    expect(terminals.map((t) => t.name)).toContain('iTerm2');
  });

  it('macOS: guarantees Terminal is present and first even when nothing is detected', async () => {
    setPlatform('darwin');
    resolveMacApp.mockResolvedValue(null);

    const { detectInstalledTerminals } = await import('../detectTerminals');
    const terminals = await detectInstalledTerminals();

    expect(terminals[0]).toMatchObject({ id: 'terminal', name: 'Terminal', isDefault: true });
  });

  it('Linux: marks the first detected terminal as the default', async () => {
    setPlatform('linux');
    resolveLinuxApp.mockImplementation((linux: { binaries: string[] }) =>
      Promise.resolve(linux.binaries.includes('konsole') ? '/usr/bin/konsole' : null),
    );

    const { detectInstalledTerminals } = await import('../detectTerminals');
    const terminals = await detectInstalledTerminals();

    expect(terminals.length).toBeGreaterThan(0);
    expect(terminals[0]).toMatchObject({ name: 'Konsole', isDefault: true });
  });
});
