import { describe, expect, it } from 'vitest';
import { nextTranscriptViewChoice } from '../useCycleTranscriptViewMode';

describe('nextTranscriptViewChoice', () => {
  it('goes Normal, Thinking, Verbose, classic and round again once the session has thinking', () => {
    expect(nextTranscriptViewChoice('normal', true)).toBe('thinking');
    expect(nextTranscriptViewChoice('thinking', true)).toBe('verbose');
    expect(nextTranscriptViewChoice('verbose', true)).toBe('classic');
    expect(nextTranscriptViewChoice('classic', true)).toBe('normal');
  });

  it('skips Thinking while the session has none', () => {
    expect(nextTranscriptViewChoice('normal', false)).toBe('verbose');
    expect(nextTranscriptViewChoice('classic', false)).toBe('normal');
  });

  it('moves on from Thinking when the session has none', () => {
    expect(nextTranscriptViewChoice('thinking', false)).toBe('verbose');
  });
});
