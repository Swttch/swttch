import { describe, it, expect } from 'vitest';
import { AutoResumeStatusPhase } from '@/shared';
import {
  computeSendAt,
  computeCountdownSeconds,
  isLimitReachedText,
  resolveAutoResumeStatusKey,
  SEND_AT_DELAY_MS,
} from '../autoResumeMath';

describe('isLimitReachedText', () => {
  it('detects real limit notice phrasings', () => {
    expect(isLimitReachedText("You've hit your session limit · resets 3pm")).toBe(true);
    expect(isLimitReachedText('Usage limit reached · resets 2:40am')).toBe(true);
    expect(isLimitReachedText("You've reached your weekly limit · resets Friday")).toBe(true);
    expect(isLimitReachedText("You've been rate limited. Try again later.")).toBe(true);
    expect(isLimitReachedText('Rate limit exceeded · resets 6pm')).toBe(true);
  });

  it('returns false for empty input', () => {
    expect(isLimitReachedText('')).toBe(false);
  });

  it('rejects a markdown answer that discusses rate limits (issue #249)', () => {
    const answer = [
      '## API Rate Limit Policy',
      '',
      '| Tier | Limit | Window |',
      '|---|---|---|',
      '| Free | 60 | 1m |',
      '',
      'Use the `Retry-After` header.',
    ].join('\n');
    expect(isLimitReachedText(answer)).toBe(false);
  });

  it('rejects prose that mentions rate limiting as a topic', () => {
    expect(isLimitReachedText('Add a rate limit to this endpoint.')).toBe(false);
    expect(isLimitReachedText('This endpoint is rate-limited by nginx.')).toBe(false);
  });

  it('rejects a long answer that quotes a notice phrase', () => {
    const answer =
      'When the CLI prints "You\'ve hit your session limit · resets 3pm", the session pauses ' +
      'until the shown reset time. Until then every send is refused, so schedule the retry for ' +
      'right after the reset instead of polling the endpoint in a loop from the client side.';
    expect(isLimitReachedText(answer)).toBe(false);
  });
});

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
