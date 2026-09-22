import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * #471. Asking the registry runs through the same runner as installing.
 *
 * `runLauncher` carries the Windows workaround: a bare `npm` is rewritten to
 * `node <npm-cli.js>` when the sibling script is there, so neither a PATH that
 * lacks the nodejs directory nor cmd.exe's re-parsing can stop it. Installing
 * used it; asking did not, and called the `npm` launcher itself.
 *
 * Measured on Windows 11 with a GUI-launched backend: the launcher at
 * `%APPDATA%\npm\npm` answered `exec: node: not found`, `latest` came back null,
 * and `extend-kit-update.ts` read that null as "nothing newer exists" and
 * returned. The companion sat on an old version for as long as the backend
 * lived — 51 polls over 25 seconds, all the same version, and not one log line.
 */

const runLauncher = vi.hoisted(() => vi.fn());
vi.mock('../../run-launcher', () => ({ runLauncher }));

import { fetchDistTags } from '../getCliUpdateInfo';

function answers(res: { ok?: boolean; stdout?: string; stderr?: string }) {
  const stdout = res.stdout ?? '';
  const stderr = res.stderr ?? '';
  return { ok: res.ok ?? true, stdout, stderr, output: `${stdout}${stderr}`.trim() };
}

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  warn.mockRestore();
  vi.restoreAllMocks();
});

describe('fetchDistTags', () => {
  it('asks through the shared launcher runner, not through npm directly', async () => {
    runLauncher.mockResolvedValue(answers({ stdout: '{"latest":"0.7.3","stable":"0.7.2"}' }));

    const tags = await fetchDistTags('@swttch/extend-kit');

    expect(runLauncher).toHaveBeenCalledTimes(1);
    const [, args] = runLauncher.mock.calls[0];
    expect(args).toEqual(['view', '@swttch/extend-kit', 'dist-tags', '--json']);
    expect(tags).toEqual({ latest: '0.7.3', stable: '0.7.2' });
  });

  it('names npm the way the platform spells it', async () => {
    const platform = vi.spyOn(process, 'platform', 'get');
    platform.mockReturnValue('win32');
    runLauncher.mockResolvedValue(answers({ stdout: '{"latest":"0.7.3"}' }));

    await fetchDistTags('@swttch/extend-kit');

    // `npm.cmd` is what exists on Windows, and it is the name the runner matches
    // to decide it can go around the launcher entirely.
    expect(runLauncher.mock.calls[0][0]).toBe('npm.cmd');
    platform.mockRestore();
  });

  it('reads stdout rather than the combined output, which a warning would spoil', async () => {
    // npm writes warnings on stderr while the JSON goes to stdout. Parsing the
    // two concatenated fails, and a failed parse is indistinguishable from "no
    // newer version" to every caller here.
    runLauncher.mockResolvedValue(
      answers({ stdout: '{"latest":"0.7.3"}', stderr: 'npm warn Unknown env config "x"' }),
    );

    expect(await fetchDistTags('@swttch/extend-kit')).toEqual({ latest: '0.7.3', stable: null });
  });

  it('answers null and says so in the log when the command failed', async () => {
    runLauncher.mockResolvedValue(answers({ ok: false, stderr: 'exec: node: not found' }));

    expect(await fetchDistTags('@swttch/extend-kit')).toEqual({ latest: null, stable: null });
    // The silence is half the defect: a null read as "nothing newer exists"
    // left no trace at all of why the companion never updated.
    expect(warn).toHaveBeenCalled();
    expect(warn.mock.calls.flat().join(' ')).toContain('node: not found');
  });

  it('says so in the log when the answer carries no latest tag', async () => {
    runLauncher.mockResolvedValue(answers({ stdout: 'not json at all' }));

    expect(await fetchDistTags('@swttch/extend-kit')).toEqual({ latest: null, stable: null });
    expect(warn).toHaveBeenCalled();
  });
});
