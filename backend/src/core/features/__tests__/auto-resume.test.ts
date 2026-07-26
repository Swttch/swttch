import { describe, it, expect, vi } from 'vitest';
import { AutoResumeStatusPhase, ScheduledMessageKind, type ScheduledMessage } from '../../../shared';
import type { CcbUsageResponse } from '../../handlers/getUsage';
import {
  isRecharged,
  utilizationFraction,
  createAutoResumeHook,
  type AutoResumeStatus,
  type AutoResumeHookDeps,
} from '../auto-resume';

const SEND_AT = '2026-03-30T10:00:00.000Z';

function makeUsage(utilization: number, resetsAt: string): CcbUsageResponse {
  return {
    five_hour: { utilization, resets_at: resetsAt },
    seven_day: null,
    seven_day_oauth_apps: null,
    seven_day_sonnet: null,
    seven_day_opus: null,
    seven_day_cowork: null,
    iguana_necktie: null,
    extra_usage: null,
  };
}

function noBucket(): CcbUsageResponse {
  return {
    five_hour: null,
    seven_day: null,
    seven_day_oauth_apps: null,
    seven_day_sonnet: null,
    seven_day_opus: null,
    seven_day_cowork: null,
    iguana_necktie: null,
    extra_usage: null,
  };
}

function makeMsg(): ScheduledMessage {
  return {
    id: 'r1',
    sessionId: 'sess-a',
    sendAt: SEND_AT,
    message: 'continue',
    kind: ScheduledMessageKind.AUTO_RESUME,
    createdAt: SEND_AT,
  };
}

describe('utilizationFraction', () => {
  it('normalizes a 0–100 percentage to a 0–1 fraction', () => {
    expect(utilizationFraction(100)).toBe(1);
    expect(utilizationFraction(50)).toBe(0.5);
  });
  it('leaves an already-fractional 0–1 value unchanged', () => {
    expect(utilizationFraction(0.2)).toBe(0.2);
    expect(utilizationFraction(1)).toBe(1);
  });
});

describe('isRecharged', () => {
  it('is false when there is no five_hour bucket (keep waiting)', () => {
    expect(isRecharged(noBucket(), SEND_AT)).toBe(false);
  });

  it('is true when utilization dropped low (0–100 scale)', () => {
    expect(isRecharged(makeUsage(5, SEND_AT), SEND_AT)).toBe(true);
  });

  it('is false when utilization is still at the limit (0–100 scale)', () => {
    expect(isRecharged(makeUsage(100, SEND_AT), SEND_AT)).toBe(false);
  });

  it('is true when resets_at rolled forward past sendAt beyond the margin', () => {
    const rolled = new Date(Date.parse(SEND_AT) + 5 * 60 * 60_000).toISOString(); // +5h
    expect(isRecharged(makeUsage(100, rolled), SEND_AT)).toBe(true);
  });

  it('is false when resets_at is only marginally past sendAt', () => {
    const barely = new Date(Date.parse(SEND_AT) + 10_000).toISOString(); // +10s, under margin
    expect(isRecharged(makeUsage(100, barely), SEND_AT)).toBe(false);
  });

  it('handles a 0–1 fractional scale defensively', () => {
    expect(isRecharged(makeUsage(0.05, SEND_AT), SEND_AT)).toBe(true);
    expect(isRecharged(makeUsage(0.9, SEND_AT), SEND_AT)).toBe(false);
  });
});

describe('createAutoResumeHook', () => {
  // Deterministic fake clock: `sleep` advances the same clock `now` reads, so no
  // real timers are involved and the retry loop is fully synchronous to advance.
  function makeDeps(
    fetchUsage: () => Promise<CcbUsageResponse>,
    overrides: Partial<AutoResumeHookDeps> = {},
  ): { deps: AutoResumeHookDeps; statuses: AutoResumeStatus[] } {
    let clock = 0;
    const statuses: AutoResumeStatus[] = [];
    const deps: AutoResumeHookDeps = {
      fetchUsage,
      now: () => clock,
      sleep: async (ms: number) => {
        clock += ms;
      },
      pollIntervalMs: 5_000,
      timeoutMs: 60_000,
      broadcast: (s) => statuses.push(s),
      ...overrides,
    };
    return { deps, statuses };
  }

  it('proceeds immediately when the quota is already recharged on the first poll', async () => {
    const fetchUsage = vi.fn(async () => makeUsage(0, SEND_AT));
    const { deps, statuses } = makeDeps(fetchUsage);
    const hook = createAutoResumeHook(deps);

    const result = await hook(makeMsg());

    expect(result).toEqual({ proceed: true });
    expect(fetchUsage).toHaveBeenCalledTimes(1);
    expect(statuses.map((s) => s.phase)).toEqual([AutoResumeStatusPhase.PROCEEDING]);
  });

  it('retries every poll interval and proceeds once recharged within the window', async () => {
    const seq = [
      makeUsage(100, SEND_AT), // not recharged
      makeUsage(100, SEND_AT), // not recharged
      makeUsage(0, SEND_AT), // recharged
    ];
    let i = 0;
    const fetchUsage = vi.fn(async () => seq[i++]);
    const { deps, statuses } = makeDeps(fetchUsage);
    const hook = createAutoResumeHook(deps);

    const result = await hook(makeMsg());

    expect(result).toEqual({ proceed: true });
    expect(fetchUsage).toHaveBeenCalledTimes(3);
    expect(statuses.map((s) => s.phase)).toEqual([
      AutoResumeStatusPhase.RETRYING,
      AutoResumeStatusPhase.RETRYING,
      AutoResumeStatusPhase.PROCEEDING,
    ]);
  });

  it('gives up with a timeout after the window elapses without recharge', async () => {
    const fetchUsage = vi.fn(async () => makeUsage(100, SEND_AT)); // never recharges
    const { deps, statuses } = makeDeps(fetchUsage);
    const hook = createAutoResumeHook(deps);

    const result = await hook(makeMsg());

    expect(result).toEqual({ proceed: false, done: true, error: 'timeout' });
    // 60_000 / 5_000 = 12 sleeps, so 13 polls before the deadline check trips.
    expect(fetchUsage).toHaveBeenCalledTimes(13);
    expect(statuses[statuses.length - 1].phase).toBe(AutoResumeStatusPhase.FAILED);
    expect(statuses[statuses.length - 1].error).toBe('timeout');
  });

  it('aborts immediately on a fetch error with a human-readable reason (network)', async () => {
    const fetchUsage = vi.fn(async () => {
      throw new Error('getaddrinfo ENOTFOUND api.anthropic.com');
    });
    const { deps, statuses } = makeDeps(fetchUsage);
    const hook = createAutoResumeHook(deps);

    const result = await hook(makeMsg());

    expect(result.proceed).toBe(false);
    expect(result.done).toBe(true);
    expect(result.error).toBe('Network error reaching Anthropic API');
    expect(fetchUsage).toHaveBeenCalledTimes(1);
    expect(statuses).toEqual([
      {
        sessionId: 'sess-a',
        scheduleId: 'r1',
        phase: AutoResumeStatusPhase.FAILED,
        attempt: 1,
        error: 'Network error reaching Anthropic API',
        errorKind: 'network',
      },
    ]);
  });
});
