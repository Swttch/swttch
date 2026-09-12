import { describe, it, expect } from 'vitest';
import { matchesPromptQuery } from '../PromptList';
import type { SavedPrompt } from '@/types/prompt';

const prompt = (name: string, content: string): SavedPrompt => ({
  id: 'p1',
  name,
  content,
  createdAt: 1,
  updatedAt: 1,
});

describe('matchesPromptQuery', () => {
  it('keeps everything when nothing has been typed', () => {
    expect(matchesPromptQuery(prompt('a', 'b'), '')).toBe(true);
    expect(matchesPromptQuery(prompt('a', 'b'), '   ')).toBe(true);
  });

  it('matches on the name', () => {
    expect(matchesPromptQuery(prompt('머지완료', 'body'), '머지')).toBe(true);
  });

  // A user who remembers the phrase but not the name they gave it still finds
  // it, which is how the `!!` panel matches too.
  it('matches on the content as well as the name', () => {
    expect(matchesPromptQuery(prompt('name', '이 diff를 리뷰해줘'), 'diff')).toBe(true);
  });

  it('ignores case', () => {
    expect(matchesPromptQuery(prompt('Review', 'body'), 'rEvIeW')).toBe(true);
  });

  it('drops a prompt that matches neither', () => {
    expect(matchesPromptQuery(prompt('name', 'body'), 'absent')).toBe(false);
  });
});
