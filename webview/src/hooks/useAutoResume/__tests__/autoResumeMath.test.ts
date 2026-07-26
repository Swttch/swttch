import { describe, it, expect } from 'vitest';
import { AutoResumeStatusPhase } from '@/shared';
import {
  computeSendAt,
  computeCountdownSeconds,
  resolveAutoResumeStatusKey,
  SEND_AT_DELAY_MS,
} from '../autoResumeMath';

describe('computeSendAt', () => {
  it('adds the 30s delay to resetsAt and returns ISO 8601', () => {
    const resetsAt = '2026-03-30T10:00:00.000Z';
    expect(computeSendAt(resetsAt)).toBe('2026-03-30T10:00:30.000Z');
  });

  it('uses exactly SEND_AT_DELAY_MS', () => {
    const base = Date.parse('2026-03-30T10:00:00.000Z');
    const out = computeSendAt('2026-03-30T10:00:00.000Z');
    expect(Date.parse(out as string) - base).toBe(SEND_AT_DELAY_MS);
  });

  it('returns null for missing or unparseable input', () => {
    expect(computeSendAt(null)).toBeNull();
    expect(computeSendAt(undefined)).toBeNull();
    expect(computeSendAt('')).toBeNull();
    expect(computeSendAt('not-a-date')).toBeNull();
  });
});

describe('computeCountdownSeconds', () => {
  const resetsAt = Date.parse('2026-03-30T10:00:00.000Z');

  it('is null before resetsAt is reached', () => {
    expect(computeCountdownSeconds(resetsAt, resetsAt - 5_000)).toBeNull();
  });

  it('is 30 exactly at resetsAt', () => {
    expect(computeCountdownSeconds(resetsAt, resetsAt)).toBe(30);
  });

  it('counts down within the window', () => {
    expect(computeCountdownSeconds(resetsAt, resetsAt + 10_000)).toBe(20);
    expect(computeCountdownSeconds(resetsAt, resetsAt + 29_000)).toBe(1);
  });

  it('is 0 exactly at the end of the window', () => {
    expect(computeCountdownSeconds(resetsAt, resetsAt + 30_000)).toBe(0);
  });

  it('is null after the window elapses', () => {
    expect(computeCountdownSeconds(resetsAt, resetsAt + 30_001)).toBeNull();
  });

  it('is null when resetsAt is NaN', () => {
    expect(computeCountdownSeconds(NaN, Date.now())).toBeNull();
  });
});

describe('resolveAutoResumeStatusKey', () => {
  it('returns null when there is no status', () => {
    expect(resolveAutoResumeStatusKey(null)).toBeNull();
    expect(resolveAutoResumeStatusKey(undefined)).toBeNull();
  });

  it('maps RETRYING and PROCEEDING to status labels', () => {
    expect(resolveAutoResumeStatusKey({ phase: AutoResumeStatusPhase.RETRYING })).toBe(
      'autoResume.status.retrying',
    );
    expect(resolveAutoResumeStatusKey({ phase: AutoResumeStatusPhase.PROCEEDING })).toBe(
      'autoResume.status.proceeding',
    );
  });

  it('maps a network fetch error to the localized network key (errorKind wins)', () => {
    expect(
      resolveAutoResumeStatusKey({
        phase: AutoResumeStatusPhase.FAILED,
        error: 'Network error reaching Anthropic API',
        errorKind: 'network',
      }),
    ).toBe('autoResume.error.network');
  });

  it('maps a bare timeout error to the timeout key', () => {
    expect(
      resolveAutoResumeStatusKey({ phase: AutoResumeStatusPhase.FAILED, error: 'timeout' }),
    ).toBe('autoResume.error.timeout');
  });

  it('maps an auth error kind to the auth key', () => {
    expect(
      resolveAutoResumeStatusKey({ phase: AutoResumeStatusPhase.FAILED, errorKind: 'auth' }),
    ).toBe('autoResume.error.auth');
  });

  it('falls back to a generic error key for anything else FAILED', () => {
    expect(
      resolveAutoResumeStatusKey({ phase: AutoResumeStatusPhase.FAILED, errorKind: 'unknown' }),
    ).toBe('autoResume.error.generic');
  });
});
