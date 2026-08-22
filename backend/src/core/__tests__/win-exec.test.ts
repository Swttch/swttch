import { describe, it, expect, vi, afterEach } from 'vitest';

// Mock child_process so we can inspect what execViaCmdArgv hands to execFile
// without launching a real process. The callback fires synchronously with a
// benign result unless a test overrides it.
vi.mock('child_process', () => ({
  execFile: vi.fn(
    (
      _cmd: string,
      _args: string[],
      _opts: unknown,
      cb?: (err: unknown, stdout: string, stderr: string) => void,
    ) => {
      cb?.(null, 'ok', '');
      return { on: vi.fn() };
    },
  ),
}));

import { execFile as cpExecFile } from 'child_process';
import { execViaCmdArgv, assertNoCmdPercentExpansion } from '../win-exec';

describe('execViaCmdArgv', () => {
  const originalComSpec = process.env.ComSpec;

  afterEach(() => {
    vi.clearAllMocks();
    if (originalComSpec === undefined) delete process.env.ComSpec;
    else process.env.ComSpec = originalComSpec;
  });

  it('spawns cmd.exe (ComSpec) as the executed file, not the launcher directly', async () => {
    process.env.ComSpec = 'C:\\Windows\\System32\\cmd.exe';
    await execViaCmdArgv('C:\\Program Files\\nodejs\\npm.cmd', ['view', '@x/y', 'dist-tags']);

    const call = vi.mocked(cpExecFile).mock.calls[0];
    expect((call[0] as string).toLowerCase()).toContain('cmd.exe');
  });

  it('passes the launcher and each arg as SEPARATE argv elements after /d /s /c', async () => {
    await execViaCmdArgv('C:\\Program Files\\npm.cmd', ['view', '@anthropic-ai/claude-code', 'dist-tags', '--json']);

    const args = vi.mocked(cpExecFile).mock.calls[0][1] as string[];
    expect(args.slice(0, 3)).toEqual(['/d', '/s', '/c']);
    // Launcher path with a space stays a SINGLE element (never split at the space).
    expect(args[3]).toBe('C:\\Program Files\\npm.cmd');
    expect(args.slice(4)).toEqual(['view', '@anthropic-ai/claude-code', 'dist-tags', '--json']);
  });

  it('runs with shell:false and windowsVerbatimArguments:false (standard quoting)', async () => {
    await execViaCmdArgv('npm.cmd', ['view', 'pkg']);

    const opts = vi.mocked(cpExecFile).mock.calls[0][2] as {
      shell?: boolean;
      windowsVerbatimArguments?: boolean;
    };
    expect(opts.shell).toBe(false);
    expect(opts.windowsVerbatimArguments).toBe(false);
  });

  it('lets callers override the default timeout (e.g. a long update)', async () => {
    await execViaCmdArgv('claude.cmd', ['update'], { timeout: 180000 });

    const opts = vi.mocked(cpExecFile).mock.calls[0][2] as { timeout?: number };
    expect(opts.timeout).toBe(180000);
  });

  it('applies a 10s default timeout when the caller passes none', async () => {
    await execViaCmdArgv('claude.cmd', ['update']);

    const opts = vi.mocked(cpExecFile).mock.calls[0][2] as { timeout?: number };
    expect(opts.timeout).toBe(10000);
  });

  it('resolves with err=null and captured output on success', async () => {
    const result = await execViaCmdArgv('npm.cmd', ['view', 'pkg']);
    expect(result.err).toBeNull();
    expect(result.stdout).toBe('ok');
  });

  it('resolves with the error (does not throw) when the command fails', async () => {
    vi.mocked(cpExecFile).mockImplementationOnce(((
      _cmd: string,
      _args: unknown,
      _opts: unknown,
      cb?: (e: unknown, o: string, s: string) => void,
    ) => {
      cb?.(new Error('exit 1'), '', 'boom');
      return { on: vi.fn() };
    }) as unknown as typeof cpExecFile);
    const result = await execViaCmdArgv('npm.cmd', ['view', 'pkg']);
    expect(result.err).toBeInstanceOf(Error);
    expect(result.stderr).toBe('boom');
  });

  it('throws before running when any arg contains `%` (cmd would expand it)', async () => {
    await expect(execViaCmdArgv('npm.cmd', ['view', '%PKG%'])).rejects.toThrow(/%/);
    expect(vi.mocked(cpExecFile)).not.toHaveBeenCalled();
  });

  it('throws when the command itself contains `%`', async () => {
    await expect(execViaCmdArgv('%LAUNCHER%.cmd', ['update'])).rejects.toThrow(/%/);
    expect(vi.mocked(cpExecFile)).not.toHaveBeenCalled();
  });

  // cmd.exe writes non-ASCII on stdout in the system's legacy OEM codepage, not UTF-8.
  // Taking Node's default utf8 decoding turns a Korean/Chinese install path into U+FFFD,
  // so we must receive raw bytes and decode them ourselves (see console-encoding.ts).
  it('asks execFile for raw bytes instead of Node default utf8 decoding', async () => {
    await execViaCmdArgv('npm.cmd', ['view', 'pkg']);

    const opts = vi.mocked(cpExecFile).mock.calls[0][2] as { encoding?: string };
    expect(opts.encoding).toBe('buffer');
  });

  it('decodes a Buffer stdout rather than returning "[object Object]"', async () => {
    vi.mocked(cpExecFile).mockImplementationOnce(((
      _cmd: string,
      _args: unknown,
      _opts: unknown,
      cb?: (e: unknown, o: Buffer, s: Buffer) => void,
    ) => {
      cb?.(null, Buffer.from('C:\tools\claude.cmd', 'utf8'), Buffer.alloc(0));
      return { on: vi.fn() };
    }) as unknown as typeof cpExecFile);

    const result = await execViaCmdArgv('where.exe', ['claude']);
    expect(result.stdout).toBe('C:\tools\claude.cmd');
    expect(result.stderr).toBe('');
  });

  it('keeps valid UTF-8 bytes intact (locale-independent)', async () => {
    const text = 'C:\사용자\claude.cmd';
    vi.mocked(cpExecFile).mockImplementationOnce(((
      _cmd: string,
      _args: unknown,
      _opts: unknown,
      cb?: (e: unknown, o: Buffer, s: Buffer) => void,
    ) => {
      cb?.(null, Buffer.from(text, 'utf8'), Buffer.alloc(0));
      return { on: vi.fn() };
    }) as unknown as typeof cpExecFile);

    const result = await execViaCmdArgv('where.exe', ['claude']);
    expect(result.stdout).toBe(text);
  });
});

describe('assertNoCmdPercentExpansion', () => {
  it('is a no-op when no arg contains `%`', () => {
    expect(() => assertNoCmdPercentExpansion(['view', 'pkg', '--json'])).not.toThrow();
  });

  it('throws naming the 1-based position of the offending arg', () => {
    expect(() => assertNoCmdPercentExpansion(['a', 'b%c'])).toThrow(/#2/);
  });

  it('does not echo the full offending value in the message', () => {
    const secret = 'super-secret-%TOKEN%';
    try {
      assertNoCmdPercentExpansion([secret]);
      throw new Error('should have thrown');
    } catch (e) {
      expect((e as Error).message).toContain('%');
      expect((e as Error).message).not.toContain(secret);
    }
  });
});
