import { describe, it, expect, vi, beforeEach } from 'vitest';

// The launcher runs through child_process; stub it so nothing actually runs.
// execFileSync is stubbed because augmented-path may probe for nvm.
vi.mock('child_process', () => ({
  execFile: vi.fn(),
  execFileSync: vi.fn(() => ''),
}));

import { execFile as cpExecFile } from 'child_process';
import { runLauncher } from '../run-launcher';

const mockExecFile = vi.mocked(cpExecFile);

type Cb = (err: Error | null, stdout: string, stderr: string) => void;
function fakeExecFile(res: { stdout?: string; stderr?: string; err?: Error | null }) {
  return ((_f: string, _a: readonly string[], _o: unknown, cb: Cb) => {
    cb(res.err ?? null, res.stdout ?? '', res.stderr ?? '');
    return { on: vi.fn() };
  }) as never;
}

const OPTS = { timeout: 1000, maxBuffer: 1024 };

beforeEach(() => vi.clearAllMocks());

describe('runLauncher', () => {
  it('reports ok and the combined stdout+stderr on success', async () => {
    mockExecFile.mockImplementation(fakeExecFile({ stdout: 'added 1 package', stderr: '' }));
    const res = await runLauncher('npm', ['install', '-g', 'pkg'], OPTS);
    expect(res).toEqual({ ok: true, output: 'added 1 package', stdout: 'added 1 package', stderr: '' });
  });

  /**
   * #471. A caller that PARSES the answer cannot read the combined text.
   *
   * `npm view … --json` writes JSON on stdout while npm writes warnings on
   * stderr, and the two concatenated are not JSON. fetchDistTags moved onto this
   * runner so the query resolves npm the same way the install does, and it can
   * only do that if the runner hands back the two streams separately.
   */
  it('hands back stdout on its own, unmixed with a warning on stderr', async () => {
    mockExecFile.mockImplementation(
      fakeExecFile({ stdout: '{"latest":"0.7.3"}', stderr: 'npm warn using --force' }),
    );
    const res = await runLauncher('npm', ['view', 'pkg', 'dist-tags', '--json'], OPTS);
    expect(res.stdout).toBe('{"latest":"0.7.3"}');
    expect(JSON.parse(res.stdout)).toEqual({ latest: '0.7.3' });
    expect(res.stderr).toBe('npm warn using --force');
  });

  it('reports not-ok and surfaces the output on failure', async () => {
    mockExecFile.mockImplementation(
      fakeExecFile({ err: new Error('Command failed'), stderr: 'npm error network ETIMEDOUT' }),
    );
    const res = await runLauncher('npm', ['install', '-g', 'pkg'], OPTS);
    expect(res.ok).toBe(false);
    expect(res.output).toContain('network ETIMEDOUT');
  });

  it('carries the launcher spec through to the executed argv on every platform', async () => {
    mockExecFile.mockImplementation(fakeExecFile({ stdout: 'ok' }));
    await runLauncher('npm', ['install', '-g', 'pkg'], OPTS);
    // win32 wraps in `cmd.exe /d /s /c npm install ...`; unix runs npm directly.
    // Either way the launcher + args appear verbatim in the executed argv.
    const file = mockExecFile.mock.calls[0][0] as string;
    const args = mockExecFile.mock.calls[0][1] as string[];
    expect([file, ...args].join(' ')).toContain('npm install -g pkg');
  });

  it.runIf(process.platform !== 'win32')(
    'runs the launcher directly with shell:false (no login shell, no tokenization)',
    async () => {
      mockExecFile.mockImplementation(fakeExecFile({ stdout: 'ok' }));
      await runLauncher('npm', ['install', '-g', 'pkg'], OPTS);
      const file = mockExecFile.mock.calls[0][0] as string;
      const args = mockExecFile.mock.calls[0][1] as string[];
      const opts = mockExecFile.mock.calls[0][2] as { shell?: boolean };
      expect(file).toBe('npm');
      expect(args).toEqual(['install', '-g', 'pkg']);
      expect(opts.shell).toBe(false);
    },
  );
});
