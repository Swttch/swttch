import { describe, it, expect } from 'vitest';
import { renameSuggestion } from '../renameSuggestion';

describe('renameSuggestion', () => {
  it('offers the current title once `/rename ` is typed', () => {
    expect(renameSuggestion('/rename ', 'My session')).toBe('My session');
  });

  it('does not offer anything before the space is typed', () => {
    expect(renameSuggestion('/rename', 'My session')).toBeNull();
  });

  it('stops offering as soon as the user types a name of their own', () => {
    expect(renameSuggestion('/rename M', 'My session')).toBeNull();
  });

  it('does not offer anything after a second space', () => {
    expect(renameSuggestion('/rename  ', 'My session')).toBeNull();
  });

  it('does not treat other commands or plain text as a rename', () => {
    expect(renameSuggestion('/model ', 'My session')).toBeNull();
    expect(renameSuggestion('please /rename ', 'My session')).toBeNull();
  });

  it('offers nothing when the session has no title', () => {
    expect(renameSuggestion('/rename ', undefined)).toBeNull();
    expect(renameSuggestion('/rename ', '   ')).toBeNull();
  });

  it('trims the title it offers', () => {
    expect(renameSuggestion('/rename ', '  My session  ')).toBe('My session');
  });
});
