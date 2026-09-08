import { afterEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ exists: true, exec: vi.fn() }));
vi.mock('child_process', () => ({ execFile: state.exec }));
vi.mock('node:fs', () => ({ existsSync: () => state.exists }));
vi.mock('../augmented-path', () => ({ augmentedEnv: () => ({}) }));
import { PackageManager, LibraryManager, AppChannel, RuntimeManager } from '../../shared';
import { buildUpdateCommand } from '../cli-update';
import { buildPackageInstallCommand, buildInstalledKitUpdateSpec, buildInstallSpec } from '../global-install-target';
import { runLauncher } from '../run-launcher';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); state.exec.mockReset(); state.exists = true; });

describe('Claude CLI and companion share package updates', () => {
  it.each([
    [PackageManager.NPM, LibraryManager.NPM], [PackageManager.PNPM, LibraryManager.PNPM],
    [PackageManager.YARN, LibraryManager.YARN], [PackageManager.VOLTA, LibraryManager.VOLTA],
  ] as const)('%s uses the same package command builder', (pm, library) => {
    expect(buildUpdateCommand(pm, '2.1.0')).toEqual(buildPackageInstallCommand(library, '@anthropic-ai/claude-code@2.1.0'));
    const kit = buildInstallSpec({ library, runtime: RuntimeManager.SYSTEM, channel: AppChannel.NONE }, '/usr/bin/node', '@swttch/extend-kit@0.5.0', 'linux', () => false);
    const expected = buildPackageInstallCommand(library, '@swttch/extend-kit@0.5.0');
    expect(kit.command).toBe(expected.command);
    expect(kit.args.filter((arg, i, args) => arg !== '--prefix' && args[i - 1] !== '--prefix')).toEqual(expected.args);
  });

  it('both update callers use the same shell-free Windows npm execution', async () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');
    vi.spyOn(process, 'execPath', 'get').mockReturnValue('C:\\Program Files\\nodejs\\node.exe');
    state.exec.mockImplementation((_command: string, _args: string[], _opts: object, callback: (err: Error | null, out: string, error: string) => void) => callback(null, 'ok', ''));
    const cli = buildUpdateCommand(PackageManager.NPM, '2.1.0')!;
    const kit = buildInstalledKitUpdateSpec('C:/Users/한 글%PATH%&/npm/node_modules', '0.5.0', process.execPath, 'C:/Users/test', 'win32', () => true)!;
    for (const spec of [cli, kit]) {
      expect((await runLauncher(spec.command, spec.args, { timeout: 1000, maxBuffer: 1024 })).ok).toBe(true);
      const [command, args, opts] = state.exec.mock.calls.at(-1)!;
      expect(command).toBe(process.execPath);
      expect(args).toEqual(['C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js', ...spec.args]);
      expect(opts.shell).toBe(false);
    }
  });

  it('both callers retain the existing Windows fallback when npm JS is unavailable', async () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');
    vi.spyOn(process, 'execPath', 'get').mockReturnValue('C:\\node\\node.exe');
    vi.stubEnv('ComSpec', 'C:\\Windows\\System32\\cmd.exe');
    state.exists = false;
    state.exec.mockImplementation((_command: string, _args: string[], _opts: object, callback: (err: Error | null, out: string, error: string) => void) => callback(null, 'ok', ''));
    for (const command of ['npm', 'npm.cmd']) {
      await runLauncher(command, ['install', '-g', 'package@1.0.0'], { timeout: 1000, maxBuffer: 1024 });
      expect(state.exec.mock.calls.at(-1)?.[0]).toBe('C:\\Windows\\System32\\cmd.exe');
    }
  });
});
