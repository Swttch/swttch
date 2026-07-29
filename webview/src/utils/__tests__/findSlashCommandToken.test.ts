import { describe, it, expect } from 'vitest';
import { findSlashCommandToken } from '@/utils/findSlashCommandToken';

/**
 * Issue #244 — "typing `/` after some text no longer opens the command panel".
 *
 * The panel used to open only when the whole input started with `/`, so a `/`
 * typed mid-line was invisible to it. The trigger is now the same shape as the
 * `@` mention one: a `/` that starts a line or follows a space, with the caret
 * still inside the token it opens.
 */
describe('findSlashCommandToken', () => {
  describe('caret inside a slash token', () => {
    it('finds a bare "/" at the start of the input', () => {
      expect(findSlashCommandToken('/', 1)).toEqual({ query: '', start: 0, end: 1 });
    });

    it('finds the token while the command name is being typed', () => {
      expect(findSlashCommandToken('/model', 6)).toEqual({ query: 'model', start: 0, end: 6 });
    });

    it('finds a "/" typed after existing text (the reported case)', () => {
      // "explain this /" — the panel must open even though text precedes it.
      expect(findSlashCommandToken('explain this /', 14)).toEqual({
        query: '',
        start: 13,
        end: 14,
      });
    });

    it('finds a partially typed command after existing text', () => {
      expect(findSlashCommandToken('explain this /rev', 17)).toEqual({
        query: 'rev',
        start: 13,
        end: 17,
      });
    });

    it('finds a token that starts on a new line', () => {
      expect(findSlashCommandToken('explain\n/rev', 12)).toEqual({
        query: 'rev',
        start: 8,
        end: 12,
      });
    });

    it('uses the caret, not the end of the text', () => {
      // Caret sits just after "/re"; the trailing " tail" is irrelevant.
      expect(findSlashCommandToken('/re tail', 3)).toEqual({ query: 're', start: 0, end: 3 });
    });

    it('reports the token nearest the caret when several exist', () => {
      expect(findSlashCommandToken('/model and /rev', 15)).toEqual({
        query: 'rev',
        start: 11,
        end: 15,
      });
    });
  });

  describe('caret outside a slash token', () => {
    it('returns null for plain text with no "/"', () => {
      expect(findSlashCommandToken('explain this', 12)).toBeNull();
    });

    it('returns null once a space ends the command name', () => {
      // The space settles the command; argument typing is handled separately.
      expect(findSlashCommandToken('/model sonnet', 13)).toBeNull();
    });

    it('returns null for a path-like "/" glued to the previous word', () => {
      // Mirrors the mention guard: "/" must follow a space or a line start.
      expect(findSlashCommandToken('see src/utils', 13)).toBeNull();
    });

    it('returns null for a nested path segment', () => {
      // A second "/" inside the token means a path, not a command.
      expect(findSlashCommandToken('open /src/utils', 15)).toBeNull();
    });

    it('returns null when the caret moved back before the "/"', () => {
      expect(findSlashCommandToken('explain /model', 4)).toBeNull();
    });

    it('returns null for an empty input', () => {
      expect(findSlashCommandToken('', 0)).toBeNull();
    });
  });
});
