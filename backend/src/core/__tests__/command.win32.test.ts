import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ExecFileException } from 'child_process';

/**
 * #471. What win32 does with a command it does not need a shell for.
 *
 * The reporter's machine had node where the official Windows installer puts it,
 * `C:\Program Files\nodejs\node.exe`. `Command.exec` sent EVERY win32 command
 * through `cmd.exe /d /s /c`, cmd.exe re-parsed the line, and the quoted path
 * came apart at its space: `'C:\Program' is not recognized as an internal or
 * external command`. Every `ccb` call the backend makes is that path, so the
 * usage panel and dictation both failed — and dictation reported the failure as
 * "the kit is not installed" while the kit sat there, current and working.
 *
 * The branch is forced rather than skipped off-Windows: a test that only runs on
 * the platform the bug is on is a test nobody runs. `process.platform` is
 * stubbed the way `run-launcher.direct.test.ts` already does it.
 */

vi.mock('child_process', () => ({
  execFile: vi.fn(),
  spawn: vi.fn(() => ({ on: vi.fn(), pid: 1234 })),
  execFileSync: vi.fn(() => ''),
}));

import { execFile as cpExecFile, spawn as cpSpawn } from 'child_process';
import { Command, ShellKind } from '../command';

const mockExecFile = vi.mocked(cpExecFile);
const mockSpawn = vi.mocked(cpSpawn);

/** Where the official Windows node installer puts node, space and all. */
const NODE = 'C:\\Program Files\\nodejs\\node.exe';
/** The kit's CLI entry, run under that node exactly as extend-kit.ts runs it. */
const CCB_ENTRY = 'C:\\Users\\r\\AppData\\Roaming\\npm\\node_modules\\@swttch\\extend-kit\\bin\\ccb.js';

type ExecFileCb = (err: ExecFileException | null, stdout: string, stderr: string) => void;

function fakeExecFile(res: { stdout?: string; stderr?: string; err?: Error | null }) {
  return ((_file: string, _args: readonly string[], _opts: unknown, cb: ExecFileCb) => {
    cb((res.err ?? null) as ExecFileException | null, res.stdout ?? '', res.stderr ?? '');
    return { on: vi.fn() };
  }) as never;
}

let platformSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  platformSpy = vi.spyOn(process, 'platform', 'get');
  platformSpy.mockReturnValue('win32');
  mockExecFile.mockImplementation(fakeExecFile({ stdout: '{"capabilities":[]}' }));
});

afterEach(() => {
  platformSpy.mockRestore();
});

describe('Command.exec on win32', () => {
  it('runs an executable image itself, never through cmd.exe', async () => {
    await new Command(NODE, [CCB_ENTRY, '--capabilities']).exec();

    const [file, args] = mockExecFile.mock.calls[0];
    // The proof: cmd.exe is not in the picture, so there is no second parser to
    // split the path at "Program Files".
    expect(file).toBe(NODE);
    expect(args).toEqual([CCB_ENTRY, '--capabilities']);
  });

  it('never lets a `.exe` path reach a cmd.exe command line at all', async () => {
    await new Command(NODE, [CCB_ENTRY, 'stt', '--check', '--json']).exec();

    const [file, args] = mockExecFile.mock.calls[0];
    expect(String(file).toLowerCase()).not.toContain('cmd.exe');
    expect(args as string[]).not.toContain('/c');
  });

  it('still runs a .cmd launcher through cmd.exe, which cannot start one itself', async () => {
    // The branch is narrowed, not removed: execFile on a batch file without a
    // shell fails outright, and a bare name needs PATHEXT to resolve.
    await new Command('npm.cmd', ['view', 'pkg', '--json']).exec();

    const [file, args] = mockExecFile.mock.calls[0];
    expect(String(file).toLowerCase()).toContain('cmd.exe');
    expect(args as string[]).toEqual(['/d', '/s', '/c', 'npm.cmd', 'view', 'pkg', '--json']);
  });

  it('does not fall into the unix login shell now that a win32 command reaches that line', async () => {
    // ShellKind.LoginInteractive has no win32 meaning. Before the `.exe` branch
    // existed, every win32 command returned earlier and the question never came
    // up; it does now.
    await new Command(NODE, ['-v'], { shell: ShellKind.LoginInteractive }).exec();

    const [file, args] = mockExecFile.mock.calls[0];
    expect(file).toBe(NODE);
    expect(args).toEqual(['-v']);
    expect(args as string[]).not.toContain('-l');
  });
});

describe('Command.spawn on win32', () => {
  it('spawns an executable image without a shell', () => {
    // `shell: true` hands the whole line to cmd.exe, which is the same tearing
    // apart by another route — and this is the call that carries the dictation
    // audio stream.
    new Command(NODE, [CCB_ENTRY, 'stt']).spawn();

    const options = mockSpawn.mock.calls[0][2] as { shell?: boolean };
    expect(options.shell).toBe(false);
  });

  it('still defaults a .cmd launcher to a shell', () => {
    new Command('claude.cmd', ['-p', 'hi']).spawn();

    const options = mockSpawn.mock.calls[0][2] as { shell?: boolean };
    expect(options.shell).toBe(true);
  });
});
