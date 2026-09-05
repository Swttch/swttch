import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../claude', () => ({ Claude: { execAuthed: vi.fn() } }));

import { Claude } from '../../claude';
import { AccountSwitchPreflightOutcome } from '../../../shared';
import {
  ACCOUNT_SWITCH_PREFLIGHT_RETRY_MS,
  ACCOUNT_SWITCH_PREFLIGHT_TIMEOUT_MS,
  verifyAccountSwitch,
} from '../account-switch-preflight';

const execMock = vi.mocked(Claude.execAuthed);

function result(value: {
  subtype: string;
  is_error: boolean;
  api_error_status?: number;
  result?: string;
}): { stdout: string; stderr: string } {
  return { stdout: JSON.stringify(value), stderr: '' };
}

beforeEach(() => execMock.mockReset());
afterEach(() => vi.useRealTimers());

describe('verifyAccountSwitch', () => {
  it('uses an authenticated, isolated, non-persistent CLI call', async () => {
    execMock.mockResolvedValue(result({ subtype: 'success', is_error: false }));

    await expect(verifyAccountSwitch('/work')).resolves.toEqual({
      outcome: AccountSwitchPreflightOutcome.SUCCESS,
    });

    const [args, workingDir, options] = execMock.mock.calls[0];
    expect(args).toEqual(expect.arrayContaining([
      '-p',
      '--effort',
      'low',
      '--exclude-dynamic-system-prompt-sections',
      '--no-session-persistence',
      '--output-format',
      'json',
      '--strict-mcp-config',
    ]));
    expect(workingDir).toBe('/work');
    expect(options?.timeout).toBeLessThanOrEqual(ACCOUNT_SWITCH_PREFLIGHT_TIMEOUT_MS);
    expect(options?.env).toMatchObject({ CLAUDE_CODE_MAX_RETRIES: '0' });
  });

  it('retries only a usage-limit result and then succeeds', async () => {
    vi.useFakeTimers();
    execMock
      .mockResolvedValueOnce(result({
        subtype: 'error_during_execution',
        is_error: true,
        api_error_status: 429,
        result: "You've hit your session limit",
      }))
      .mockResolvedValueOnce(result({ subtype: 'success', is_error: false }));

    const pending = verifyAccountSwitch('/work');
    await vi.advanceTimersByTimeAsync(ACCOUNT_SWITCH_PREFLIGHT_RETRY_MS);

    await expect(pending).resolves.toEqual({ outcome: AccountSwitchPreflightOutcome.SUCCESS });
    expect(execMock).toHaveBeenCalledTimes(2);
  });

  it('stops immediately on a non-limit failure and returns its reason', async () => {
    execMock.mockResolvedValue(result({
      subtype: 'error_during_execution',
      is_error: true,
      result: 'Authentication failed',
    }));

    await expect(verifyAccountSwitch()).resolves.toEqual({
      outcome: AccountSwitchPreflightOutcome.ERROR,
      error: 'Authentication failed',
    });
    expect(execMock).toHaveBeenCalledTimes(1);
  });

  it('stops after twenty seconds when every probe is rate-limited', async () => {
    vi.useFakeTimers();
    execMock.mockResolvedValue(result({
      subtype: 'error_during_execution',
      is_error: true,
      api_error_status: 429,
      result: "You've hit your session limit",
    }));

    const pending = verifyAccountSwitch('/work');
    await vi.advanceTimersByTimeAsync(ACCOUNT_SWITCH_PREFLIGHT_TIMEOUT_MS);

    await expect(pending).resolves.toEqual({ outcome: AccountSwitchPreflightOutcome.TIMEOUT });
    expect(execMock.mock.calls.length).toBeGreaterThan(1);
  });

});
