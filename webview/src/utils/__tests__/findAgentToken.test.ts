import { describe, it, expect } from 'vitest';
import { findAgentToken } from '@/utils/findAgentToken';
import { findPromptToken } from '@/utils/findPromptToken';
import { findSlashCommandToken } from '@/utils/findSlashCommandToken';
import { isCaretInMentionToken } from '@/utils/isCaretInMentionToken';

/**
 * The active-session panel opens on `@@`.
 *
 * The trigger is two at-signs because a single `@` is already a file reference.
 * The rules are the same shape as the `/`, `@` and `!!` ones, so all four can
 * share the single slot above the composer.
 */
describe('findAgentToken', () => {
  describe('caret inside an agent token', () => {
    it('finds a bare "@@" at the start of the input', () => {
      expect(findAgentToken('@@', 2)).toEqual({ query: '', start: 0, end: 2 });
    });

    it('finds the token while the session name is being typed', () => {
      expect(findAgentToken('@@review', 8)).toEqual({ query: 'review', start: 0, end: 8 });
    });

    it('finds a "@@" typed after existing text', () => {
      expect(findAgentToken('ask this ', 9)).toBeNull();
      expect(findAgentToken('ask this @@', 11)).toEqual({ query: '', start: 9, end: 11 });
    });

    it('finds a "@@" at the start of a new line', () => {
      expect(findAgentToken('line one\n@@b1', 13)).toEqual({ query: 'b1', start: 9, end: 13 });
    });

    it('reads the query up to the caret, not to the end of the value', () => {
      // Caret sits just past "@@re": offsets 0..4.
      expect(findAgentToken('@@review the diff', 4)).toEqual({ query: 're', start: 0, end: 4 });
    });
  });

  describe('caret outside an agent token', () => {
    it('returns null for a value with no "@@"', () => {
      expect(findAgentToken('just a message', 14)).toBeNull();
    });

    it('returns null for a single "@", which is a file reference', () => {
      expect(findAgentToken('@src/App.tsx', 12)).toBeNull();
    });

    it('returns null when "@@" is glued to the end of a word', () => {
      expect(findAgentToken('wow@@', 5)).toBeNull();
    });

    it('returns null when "@@" sits mid-word', () => {
      expect(findAgentToken('a@@b', 4)).toBeNull();
    });

    it('returns null once whitespace has settled the token', () => {
      expect(findAgentToken('@@b1 please check', 17)).toBeNull();
      expect(findAgentToken('@@b1 ', 5)).toBeNull();
    });

    it('returns null for a third at-sign, rather than reading it as a query', () => {
      expect(findAgentToken('@@@', 3)).toBeNull();
    });
  });

  /**
   * The four triggers share one slot above the composer, so a value that opens
   * one must not open another. `@@` is the interesting case: the file mention
   * detector rejects it on its own, which is what leaves the keystroke free.
   */
  describe('the four triggers never claim the same token', () => {
    it('"@@" opens the agent panel and closes the file mention panel', () => {
      expect(findAgentToken('@@', 2)).not.toBeNull();
      expect(isCaretInMentionToken('@@', 2)).toBe(false);
      expect(findPromptToken('@@', 2)).toBeNull();
      expect(findSlashCommandToken('@@', 2)).toBeNull();
    });

    it('a single "@" opens the file mention panel and not the agent panel', () => {
      expect(isCaretInMentionToken('@', 1)).toBe(true);
      expect(findAgentToken('@', 1)).toBeNull();
    });

    it('"!!" opens the prompt library and not the agent panel', () => {
      expect(findPromptToken('!!', 2)).not.toBeNull();
      expect(findAgentToken('!!', 2)).toBeNull();
    });

    it('"/" opens the slash command panel and not the agent panel', () => {
      expect(findSlashCommandToken('/co', 3)).not.toBeNull();
      expect(findAgentToken('/co', 3)).toBeNull();
    });
  });
});
