import { describe, it, expect } from 'vitest';
import { isCaretInMentionToken } from '@/utils/isCaretInMentionToken';

/**
 * Issue #236 — "@ file mention does not work in the context of a skill".
 *
 * The slash command panel and the file mention dropdown share one screen slot,
 * so exactly one of them may be visible. The decision hinges on where the caret
 * sits: inside an `@token` the user is picking a file, anywhere else they are
 * still working on the command itself.
 */
describe('isCaretInMentionToken', () => {
  describe('caret inside an @ token', () => {
    it('is true right after a bare "@"', () => {
      expect(isCaretInMentionToken('@', 1)).toBe(true);
    });

    it('is true while typing the query after "@"', () => {
      expect(isCaretInMentionToken('@src', 4)).toBe(true);
    });

    it('is true for an @ token that follows a slash command (the reported case)', () => {
      // "/opsx:apply @skill" with the caret at the end.
      expect(isCaretInMentionToken('/opsx:apply @skill', 18)).toBe(true);
    });

    it('is true for an @ token following a built-in slash command', () => {
      expect(isCaretInMentionToken('/review @s', 10)).toBe(true);
    });

    it('is true when the @ token starts on a new line', () => {
      expect(isCaretInMentionToken('/review\n@src', 12)).toBe(true);
    });

    it('uses the caret, not the end of the text', () => {
      // Caret sits just after "@sr"; the trailing " tail" is irrelevant.
      expect(isCaretInMentionToken('/review @sr tail', 11)).toBe(true);
    });
  });

  describe('caret outside an @ token', () => {
    it('is false for plain text with no "@"', () => {
      expect(isCaretInMentionToken('/review', 7)).toBe(false);
    });

    it('is false once a space ends the mention query', () => {
      // The space settles the mention, so the caret is back in command context.
      expect(isCaretInMentionToken('/review @src ', 13)).toBe(false);
    });

    it('is false when the caret moved back before the "@"', () => {
      expect(isCaretInMentionToken('/review @src', 5)).toBe(false);
    });

    it('is false for an email-like "@" glued to the previous word', () => {
      // Same guard useMention applies: "@" must follow a space or line start.
      expect(isCaretInMentionToken('mail fred@01republic.io', 23)).toBe(false);
    });

    it('is false for an empty input', () => {
      expect(isCaretInMentionToken('', 0)).toBe(false);
    });
  });
});
