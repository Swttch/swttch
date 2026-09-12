import { describe, it, expect } from 'vitest';
import {
  groupPromptsByCategory,
  flattenGroups,
  existingCategories,
} from '../promptCategories';
import type { SavedPrompt } from '@/types/prompt';

const prompt = (id: string, category?: string): SavedPrompt => ({
  id,
  name: id,
  content: id,
  createdAt: 1,
  updatedAt: 1,
  ...(category === undefined ? {} : { category }),
});

describe('groupPromptsByCategory', () => {
  it('puts everything in one uncategorised group when nobody set a category', () => {
    const groups = groupPromptsByCategory([prompt('a'), prompt('b')]);
    expect(groups).toEqual([{ category: null, prompts: [prompt('a'), prompt('b')] }]);
  });

  it('gathers the prompts of one category under one heading', () => {
    const groups = groupPromptsByCategory([
      prompt('a', 'Debug'),
      prompt('b', 'Review'),
      prompt('c', 'Debug'),
    ]);
    expect(groups.map((g) => g.category)).toEqual(['Debug', 'Review']);
    expect(groups[0].prompts.map((p) => p.id)).toEqual(['a', 'c']);
  });

  // A list the user just reordered must not reshuffle its headings as well.
  it('orders categories by where their first prompt appeared', () => {
    const groups = groupPromptsByCategory([prompt('a', 'Zebra'), prompt('b', 'Apple')]);
    expect(groups.map((g) => g.category)).toEqual(['Zebra', 'Apple']);
  });

  it('puts the uncategorised group last', () => {
    const groups = groupPromptsByCategory([prompt('a'), prompt('b', 'Debug')]);
    expect(groups.map((g) => g.category)).toEqual(['Debug', null]);
  });

  it('leaves out the uncategorised group when every prompt has a category', () => {
    const groups = groupPromptsByCategory([prompt('a', 'Debug')]);
    expect(groups).toHaveLength(1);
    expect(groups[0].category).toBe('Debug');
  });

  // A blank category is not a category, or the heading would read as two
  // separate "uncategorised" groups.
  it('treats a blank category as none', () => {
    const groups = groupPromptsByCategory([prompt('a', '   '), prompt('b', '')]);
    expect(groups.map((g) => g.category)).toEqual([null]);
    expect(groups[0].prompts).toHaveLength(2);
  });

  it('matches categories that differ only by surrounding space', () => {
    const groups = groupPromptsByCategory([prompt('a', 'Debug'), prompt('b', ' Debug ')]);
    expect(groups).toHaveLength(1);
    expect(groups[0].prompts).toHaveLength(2);
  });

  it('has nothing to group when there are no prompts', () => {
    expect(groupPromptsByCategory([])).toEqual([]);
  });
});

describe('flattenGroups', () => {
  // The arrow keys walk this, and grouping changes the order rows are drawn in.
  it('returns the prompts in the order the headings put them', () => {
    const groups = groupPromptsByCategory([
      prompt('a'),
      prompt('b', 'Debug'),
      prompt('c'),
      prompt('d', 'Debug'),
    ]);
    expect(flattenGroups(groups).map((p) => p.id)).toEqual(['b', 'd', 'a', 'c']);
  });
});

describe('existingCategories', () => {
  it('lists each category once, alphabetically', () => {
    const names = existingCategories([
      prompt('a', 'Review'),
      prompt('b', 'Debug'),
      prompt('c', 'Review'),
    ]);
    expect(names).toEqual(['Debug', 'Review']);
  });

  it('leaves out prompts with no category', () => {
    expect(existingCategories([prompt('a'), prompt('b', '  ')])).toEqual([]);
  });
});
