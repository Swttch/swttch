import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Claude } from '../../claude';
import {
  probeFableAvailability,
  getFableAvailability,
  invalidateFableProbeCache,
  FABLE_PROBE_TTL_MS,
} from '../fable-probe';

vi.mock('../../claude', () => ({ Claude: { exec: vi.fn() } }));

const execMock = vi.mocked(Claude.exec);

/** A clean `--output-format json` success result from a real fable call. */
function successStdout(): string {
  return JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: 'OK' });
}

beforeEach(() => {
  execMock.mockReset();
  invalidateFableProbeCache();
});

describe('probeFableAvailability', () => {
  it('runs the fast/cheap probe flags (effort low, exclude-dynamic, no-session-persistence)', async () => {
    execMock.mockResolvedValue({ stdout: successStdout(), stderr: '' });
    await probeFableAvailability('/work');
    const [args, opts] = execMock.mock.calls[0];
    expect(args).toEqual(
      expect.arrayContaining([
        '-p',
        '--model',
        'fable',
        '--effort',
        'low',
        '--exclude-dynamic-system-prompt-sections',
        '--no-session-persistence',
        '--output-format',
        'json',
      ]),
    );
    expect(opts).toMatchObject({ cwd: '/work' });
  });

  it('loads no MCP server, because the probe never calls a tool', async () => {
    // Without this the probe starts every MCP server the workspace configures,
    // and a `docker run` server leaves its container behind afterwards (#363).
    execMock.mockResolvedValue({ stdout: successStdout(), stderr: '' });
    await probeFableAvailability('/work');
    const [args] = execMock.mock.calls[0];
    expect(args).toContain('--strict-mcp-config');
    // Restricting to `--mcp-config` only means "none" when no config is passed;
    // passing one would put the servers back.
    expect(args).not.toContain('--mcp-config');
  });

  it('returns true only on a clean success result', async () => {
    execMock.mockResolvedValue({ stdout: successStdout(), stderr: '' });
    await expect(probeFableAvailability()).resolves.toBe(true);
  });

  it('returns false when the result reports an error', async () => {
    execMock.mockResolvedValue({
      stdout: JSON.stringify({ type: 'result', subtype: 'error_during_execution', is_error: true }),
      stderr: '',
    });
    await expect(probeFableAvailability()).resolves.toBe(false);
  });

  it('parses the LAST json line when hooks/noise precede the result', async () => {
    const stdout = ['{"type":"system","subtype":"hook_started"}', successStdout()].join('\n');
    execMock.mockResolvedValue({ stdout, stderr: '' });
    await expect(probeFableAvailability()).resolves.toBe(true);
  });

  it('fails closed on unparseable output', async () => {
    execMock.mockResolvedValue({ stdout: 'not json at all', stderr: '' });
    await expect(probeFableAvailability()).resolves.toBe(false);
  });

  it('fails closed when the CLI throws (entitlement error, timeout, etc.)', async () => {
    execMock.mockRejectedValue(new Error('boom'));
    await expect(probeFableAvailability()).resolves.toBe(false);
  });
});

describe('getFableAvailability (cache + TTL)', () => {
  it('probes when the cache is empty and stores the result', async () => {
    execMock.mockResolvedValue({ stdout: successStdout(), stderr: '' });
    const r = await getFableAvailability({ now: 1_000 });
    expect(r).toMatchObject({ available: true, checkedAt: 1_000, fromCache: false });
    expect(execMock).toHaveBeenCalledTimes(1);
  });

  it('serves from cache within the TTL without re-probing', async () => {
    execMock.mockResolvedValue({ stdout: successStdout(), stderr: '' });
    await getFableAvailability({ now: 1_000 });
    const second = await getFableAvailability({ now: 1_000 + FABLE_PROBE_TTL_MS - 1 });
    expect(second).toMatchObject({ available: true, fromCache: true });
    expect(execMock).toHaveBeenCalledTimes(1);
  });

  it('re-probes once the TTL has elapsed', async () => {
    execMock.mockResolvedValue({ stdout: successStdout(), stderr: '' });
    await getFableAvailability({ now: 1_000 });
    await getFableAvailability({ now: 1_000 + FABLE_PROBE_TTL_MS });
    expect(execMock).toHaveBeenCalledTimes(2);
  });

  it('caches a negative result too (no re-probe storm for ineligible accounts)', async () => {
    execMock.mockRejectedValue(new Error('not entitled'));
    const r = await getFableAvailability({ now: 1_000 });
    expect(r).toMatchObject({ available: false, fromCache: false });
    const again = await getFableAvailability({ now: 2_000 });
    expect(again).toMatchObject({ available: false, fromCache: true });
    expect(execMock).toHaveBeenCalledTimes(1);
  });

  it('force bypasses a valid cache', async () => {
    execMock.mockResolvedValue({ stdout: successStdout(), stderr: '' });
    await getFableAvailability({ now: 1_000 });
    await getFableAvailability({ now: 1_500, force: true });
    expect(execMock).toHaveBeenCalledTimes(2);
  });
});
