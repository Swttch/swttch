import { describe, it, expect } from 'vitest';
import { AutoResumeStatusPhase } from '@/shared';
import {
  computeSendAt,
  computeCountdownSeconds,
  resolveAutoResumeStatusKey,
  SEND_AT_DELAY_MS,
} from '../autoResumeMath';
import { isLimitErrorMessage } from '@/types';

/**
 * Notice identification moved from text matching to the CLI's own markers
 * (see `isLimitErrorMessage`). These cases keep issue #249's guarantee: an
 * ordinary answer is never taken for a notice, no matter how it is worded.
 */
describe('usage-limit notice identification (issue #249)', () => {
  /** A CLI notice: markers set, wording varies by plan / org / CLI version. */
  const notice = (text: string) => ({
    message: { role: 'assistant', content: [{ type: 'text', text }] },
    isApiErrorMessage: true,
    apiErrorStatus: 429,
    error: 'rate_limit',
  });
  /** An ordinary model answer: no markers, whatever it happens to say. */
  const answer = (text: string) => ({
    message: { role: 'assistant', content: [{ type: 'text', text }] },
    isApiErrorMessage: undefined,
    apiErrorStatus: undefined,
    error: undefined,
  });

  it('detects a real notice regardless of its wording', () => {
    for (const text of [
      "You've hit your session limit · resets 3pm",
      'Usage limit reached ∙ resets 2:40am',
      'Weekly limit reached ∙ resets Friday',
      'Opus weekly limit reached, now using extra usage',
      'Limit reached – contact an admin to keep working',
      'Session limit resets 3pm ∙ contact an admin to keep working',
    ]) {
      expect(isLimitErrorMessage(notice(text)), text).toBe(true);
    }
  });

  it('never mistakes an ordinary answer for a notice, however it is worded', () => {
    for (const text of [
      // the issue's repro: a markdown answer about rate limiting
      '## API Rate Limit Policy\n\n| Tier | Limit |\n|---|---|\n| Free | 60 |',
      // topical prose
      'Add a rate limit to this endpoint.',
      'This endpoint is rate-limited by nginx.',
      // a short sentence that happens to read like a notice
      'The size limit reached 1024.',
      // an answer quoting the notice text verbatim — wording cannot fake markers
      'When the CLI prints "You\'ve hit your session limit · resets 3pm", the session pauses.',
    ]) {
      expect(isLimitErrorMessage(answer(text)), text).toBe(false);
    }
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
