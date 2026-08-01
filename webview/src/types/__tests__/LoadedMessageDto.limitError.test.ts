import { describe, it, expect } from 'vitest';
import { LoadedMessageDto, isLimitErrorMessage } from '../index';
import { LoadedMessageType, toInstance } from '../../dto/common';

/**
 * Real-world usage-limit entry shape emitted by the Claude CLI stream-json.
 * Measured across 66,398 assistant entries in ~/.claude/projects: every entry
 * carrying `error: 'rate_limit'` was a genuine limit notice (66/66), and the
 * marker trio was 100% consistent — no ordinary answer ever carries it:
 *
 *   { type: 'assistant',
 *     message: { model: '<synthetic>', content: [{ type: 'text',
 *                text: "You've hit your session limit · resets 7:20pm (Asia/Seoul)" }] },
 *     error: 'rate_limit', isApiErrorMessage: true, apiErrorStatus: 429 }
 *
 * This is why detection keys off the CLI's own markers instead of matching the
 * notice text: the wording varies by plan, org type and CLI version
 * (`Session limit reached ∙ resets 3pm`, `Weekly limit reached, now using extra
 * usage`, `Limit reached – contact an admin to keep working`, …), while the
 * markers do not.
 */
describe('isLimitErrorMessage', () => {
  function build(extra: Record<string, unknown>): LoadedMessageDto {
    return toInstance(LoadedMessageDto, {
      type: LoadedMessageType.Assistant,
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: "You've hit your session limit · resets 7:20pm (Asia/Seoul)" }],
      },
      ...extra,
    });
  }

  it('is true for the measured 429 / rate_limit notice entry', () => {
    const msg = build({ isApiErrorMessage: true, apiErrorStatus: 429, error: 'rate_limit' });
    expect(isLimitErrorMessage(msg)).toBe(true);
  });

  it('is true when only the rate_limit error code is present (no status)', () => {
    const msg = build({ isApiErrorMessage: true, error: 'rate_limit' });
    expect(isLimitErrorMessage(msg)).toBe(true);
  });

  it('is true when only apiErrorStatus 429 is present (no error code)', () => {
    const msg = build({ isApiErrorMessage: true, apiErrorStatus: 429 });
    expect(isLimitErrorMessage(msg)).toBe(true);
  });

  it('detects limit notices whose wording differs by plan or CLI version', () => {
    // Wording taken verbatim from the installed CLI bundle's notice assembly.
    for (const text of [
      'Session limit reached ∙ resets 3pm',
      'Weekly limit reached ∙ resets Friday',
      'Opus weekly limit reached, now using extra usage',
      'Limit reached – contact an admin to keep working',
      'Session limit resets 3pm ∙ contact an admin to keep working',
      'Spending cap reached ∙ resets 3pm',
    ]) {
      const msg = toInstance(LoadedMessageDto, {
        type: LoadedMessageType.Assistant,
        message: { role: 'assistant', content: [{ type: 'text', text }] },
        isApiErrorMessage: true,
        apiErrorStatus: 429,
        error: 'rate_limit',
      });
      expect(isLimitErrorMessage(msg), text).toBe(true);
    }
  });

  it('is false for an auth error (401)', () => {
    const msg = toInstance(LoadedMessageDto, {
      type: LoadedMessageType.Assistant,
      message: { role: 'assistant', content: [{ type: 'text', text: 'Failed to authenticate.' }] },
      isApiErrorMessage: true,
      apiErrorStatus: 401,
      error: 'authentication_failed',
    });
    expect(isLimitErrorMessage(msg)).toBe(false);
  });

  it('is false for a non-limit api error (socket closed)', () => {
    const msg = toInstance(LoadedMessageDto, {
      type: LoadedMessageType.Assistant,
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: 'API Error: The socket connection was closed unexpectedly' }],
      },
      isApiErrorMessage: true,
    });
    expect(isLimitErrorMessage(msg)).toBe(false);
  });

  it('is false for an ordinary answer that merely discusses rate limiting (issue #249)', () => {
    const msg = toInstance(LoadedMessageDto, {
      type: LoadedMessageType.Assistant,
      message: {
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: '## API Rate Limit Policy\n\n| Tier | Limit |\n|---|---|\n| Free | 60 |\n\nUsage limit reached is the error string.',
          },
        ],
      },
    });
    expect(isLimitErrorMessage(msg)).toBe(false);
  });

  it('is false for a short sentence that happens to say "limit reached"', () => {
    const msg = toInstance(LoadedMessageDto, {
      type: LoadedMessageType.Assistant,
      message: { role: 'assistant', content: [{ type: 'text', text: 'The size limit reached 1024.' }] },
    });
    expect(isLimitErrorMessage(msg)).toBe(false);
  });

  it('preserves the raw CLI fields through class-transformer (original-data preservation)', () => {
    const msg = build({ isApiErrorMessage: true, apiErrorStatus: 429, error: 'rate_limit' });
    expect(msg.isApiErrorMessage).toBe(true);
    expect(msg.apiErrorStatus).toBe(429);
    expect(msg.error).toBe('rate_limit');
  });
});

describe('isLimitErrorMessage (plain-object safe — live streaming path)', () => {
  it('detects limit notices on a plain object without class-transformer', () => {
    expect(isLimitErrorMessage({ isApiErrorMessage: true, apiErrorStatus: 429 })).toBe(true);
    expect(isLimitErrorMessage({ isApiErrorMessage: true, error: 'rate_limit' })).toBe(true);
  });

  it('is false without the isApiErrorMessage marker', () => {
    expect(isLimitErrorMessage({ apiErrorStatus: 429 })).toBe(false);
    expect(isLimitErrorMessage({ error: 'rate_limit' })).toBe(false);
    expect(isLimitErrorMessage({})).toBe(false);
  });
});
