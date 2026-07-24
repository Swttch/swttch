import { describe, it, expect, vi, afterEach } from 'vitest';
import { join } from 'path';

// Stub child_process/fs so resolveWindowsApp's `reg query` + fs.access calls
// never touch a real machine, and Windows-specific behavior can be tested
// from any OS.
vi.mock('child_process', () => ({
  execFile: vi.fn(),
}));

vi.mock('fs/promises', () => ({
  access: vi.fn(),
}));

import { execFile as cpExecFile } from 'child_process';
import { access as fsAccess } from 'fs/promises';
import { resolveWindowsApp } from '../resolveWindows';
import type { WindowsDetection } from '../resolveApp';

type ExecFileCallback = (error: unknown, stdout: string, stderr: string) => void;

/** Wires execFile('reg', ['query', keyPath], cb) to `handler(keyPath)`. */
function mockRegQuery(handler: (keyPath: string) => string | null) {
  vi.mocked(cpExecFile).mockImplementation(((
    _cmd: string,
    args: string[],
    cb: ExecFileCallback,
  ) => {
    const keyPath = args[1];
    const stdout = handler(keyPath);
    if (stdout === null) {
      cb(new Error('ERROR: The system was unable to find the specified registry key or value.'), '', '');
    } else {
      cb(null, stdout, '');
    }
    return { on: vi.fn() };
  }) as unknown as typeof cpExecFile);
}

function regValuesOutput(values: Record<string, string>): string {
  const lines = ['', ''];
  for (const [name, value] of Object.entries(values)) {
    lines.push(`    ${name}    REG_SZ    ${value}`);
  }
  lines.push('');
  return lines.join('\r\n');
}

describe('resolveWindowsApp', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns the executable path when a JetBrains version-combo registry key validates', async () => {
    const win: WindowsDetection = {
      jetbrainsProduct: 'TestIDE',
      jetbrainsExeBase: 'testide',
      displayNamePrefixes: ['TestIDE'],
      publishers: ['JetBrains s.r.o.'],
    };
    const installLocation = 'C:\\Program Files\\JetBrains\\TestIDE 2026.1';
    const expectedExe = join(installLocation, 'bin', 'testide64.exe');

    // Any generated version-combo key for "TestIDE" resolves successfully;
    // we don't hardcode a specific year since the resolver derives it from
    // the current date.
    mockRegQuery((keyPath) => {
      if (/\\TestIDE \d+\.\d+(\.\d+)?$/.test(keyPath)) {
        return regValuesOutput({
          DisplayName: 'TestIDE 2026.1',
          Publisher: 'JetBrains s.r.o.',
          InstallLocation: installLocation,
        });
      }
      return null;
    });

    vi.mocked(fsAccess).mockImplementation(async (p) => {
      if (String(p) === expectedExe) {
        return undefined;
      }
      throw new Error('ENOENT');
    });

    const result = await resolveWindowsApp(win);
    expect(result).toBe(expectedExe);
  });

  it('strips quotes and the icon index from a DisplayIcon value', async () => {
    const win: WindowsDetection = {
      registryKeys: [{ hive: 'HKCU', subKey: 'test-cursor-key' }],
      displayNamePrefixes: ['Cursor'],
      publishers: ['Cursor AI, Inc.'],
      useDisplayIcon: true,
    };
    const exePath = 'C:\\Users\\test\\AppData\\Local\\Programs\\cursor\\Cursor.exe';

    mockRegQuery((keyPath) => {
      if (keyPath.endsWith('\\test-cursor-key')) {
        return regValuesOutput({
          DisplayName: 'Cursor',
          Publisher: 'Cursor AI, Inc.',
          DisplayIcon: `"${exePath}",0`,
        });
      }
      return null;
    });

    vi.mocked(fsAccess).mockImplementation(async (p) => {
      if (String(p) === exePath) {
        return undefined;
      }
      throw new Error('ENOENT');
    });

    const result = await resolveWindowsApp(win);
    expect(result).toBe(exePath);
  });

  it('returns null when nothing matching is installed', async () => {
    const win: WindowsDetection = {
      registryKeys: [
        { hive: 'HKCU', subKey: 'missing-app-key' },
        { hive: 'HKLM', subKey: 'missing-app-key', wow64: true },
      ],
      jetbrainsProduct: 'NothingHereIDE',
      jetbrainsExeBase: 'nothinghere',
      displayNamePrefixes: ['Nothing Here'],
      publishers: ['Nobody'],
    };

    mockRegQuery(() => null);
    vi.mocked(fsAccess).mockRejectedValue(new Error('ENOENT'));

    const result = await resolveWindowsApp(win);
    expect(result).toBeNull();
  });
});
