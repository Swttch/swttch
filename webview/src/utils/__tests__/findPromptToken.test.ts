import { describe, it, expect } from 'vitest';
import { findPromptToken } from '@/utils/findPromptToken';
import { findSlashCommandToken } from '@/utils/findSlashCommandToken';
import { isCaretInMentionToken } from '@/utils/isCaretInMentionToken';

/**
 * Issue #430 — the prompt library opens on `!!`.
 *
 * The trigger is two bangs because the CLI already spends one leading `!` on
 * shell mode. The rules are otherwise the same shape as the `/` and `@` ones, so
 * the three can share the single slot above the composer.
 */
describe('findPromptToken', () => {
  describe('caret inside a prompt token', () => {
    it('finds a bare "!!" at the start of the input', () => {
      expect(findPromptToken('!!', 2)).toEqual({ query: '', start: 0, end: 2 });
    });

    it('finds the token while the prompt name is being typed', () => {
      expect(findPromptToken('!!merge', 7)).toEqual({ query: 'merge', start: 0, end: 7 });
    });

    it('finds a "!!" typed after existing text', () => {
      expect(findPromptToken('before that ', 12)).toBeNull();
      expect(findPromptToken('before that !!', 14)).toEqual({ query: '', start: 12, end: 14 });
    });

    it('finds a token that starts on a new line', () => {
      expect(findPromptToken('first line\n!!me', 15)).toEqual({ query: 'me', start: 11, end: 15 });
    });

    it('uses the caret, not the end of the text', () => {
      expect(findPromptToken('!!me tail', 4)).toEqual({ query: 'me', start: 0, end: 4 });
    });

    it('reports the token nearest the caret when several exist', () => {
      expect(findPromptToken('!!one and !!two', 15)).toEqual({ query: 'two', start: 10, end: 15 });
    });

    it('accepts a Korean query', () => {
      expect(findPromptToken('!!머지', 5)).toEqual({ query: '머지', start: 0, end: 5 });
    });
  });

  describe('caret outside a prompt token', () => {
    it('returns null for a single bang, which the CLI spends on shell mode', () => {
      expect(findPromptToken('!', 1)).toBeNull();
      expect(findPromptToken('!ls', 3)).toBeNull();
    });

    it('returns null while only the first bang has been typed', () => {
      // The caret sits between the two bangs of "!!": the panel must wait.
      expect(findPromptToken('!!', 1)).toBeNull();
    });

    it('returns null for bangs glued to the end of a word', () => {
      expect(findPromptToken('wow!!', 5)).toBeNull();
      expect(findPromptToken('a!!b', 4)).toBeNull();
    });

    it('returns null for three bangs, which are not the trigger', () => {
      expect(findPromptToken('!!!x', 4)).toBeNull();
    });

    it('returns null once a space ends the query', () => {
      expect(findPromptToken('!!merge cleanup', 15)).toBeNull();
    });

    it('returns null when the caret moved back before the trigger', () => {
      expect(findPromptToken('explain !!me', 4)).toBeNull();
    });

    it('returns null for plain text and for an empty input', () => {
      expect(findPromptToken('explain this', 12)).toBeNull();
      expect(findPromptToken('', 0)).toBeNull();
    });
  });

  /**
   * The three detectors share one slot above the composer, so a value that
   * activates one must not activate another at the same caret. #236 and #244
   * were both caused by two of them claiming the slot at once.
   */
  describe('the three composer detectors stay mutually exclusive', () => {
    const cases: Array<{ value: string; caret: number; owner: 'prompt' | 'slash' | 'mention' }> = [
      { value: '!!merge', caret: 7, owner: 'prompt' },
      { value: '/model', caret: 6, owner: 'slash' },
      { value: '@src', caret: 4, owner: 'mention' },
      { value: '/review !!me', caret: 12, owner: 'prompt' },
      { value: '@src/App.tsx !!me', caret: 17, owner: 'prompt' },
      { value: '!!me and /rev', caret: 13, owner: 'slash' },
      { value: '!!me and @src', caret: 13, owner: 'mention' },
    ];

    for (const { value, caret, owner } of cases) {
      it(`gives ${JSON.stringify(value)} to the ${owner} detector alone`, () => {
        const claimed = {
          prompt: findPromptToken(value, caret) !== null,
          slash: findSlashCommandToken(value, caret) !== null,
          mention: isCaretInMentionToken(value, caret),
        };
        expect(claimed).toEqual({
          prompt: owner === 'prompt',
          slash: owner === 'slash',
          mention: owner === 'mention',
        });
      });
    }
  });
});
