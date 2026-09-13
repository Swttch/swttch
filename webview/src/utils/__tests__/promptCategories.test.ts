import { describe, it, expect } from 'vitest';
import {
  ALL_CATEGORIES,
  UNCATEGORISED,
  matchesCategorySelection,
  countByCategory,
  categoryNamesOf,
  matchesCategoryName,
} from '../promptCategories';
import type { PromptCategory, SavedPrompt } from '@/types/prompt';

const category = (id: string, name: string): PromptCategory => ({ id, name, createdAt: 1 });

const prompt = (id: string, categories?: string[]): SavedPrompt => ({
  id,
  name: id,
  content: id,
  createdAt: 1,
  updatedAt: 1,
  ...(categories === undefined ? {} : { categories }),
});

const categories = [category('c1', 'Debug'), category('c2', 'Review')];

describe('matchesCategorySelection', () => {
  it('keeps everything under "all"', () => {
    expect(matchesCategorySelection(prompt('p1'), ALL_CATEGORIES, categories)).toBe(true);
    expect(matchesCategorySelection(prompt('p2', ['c1']), ALL_CATEGORIES, categories)).toBe(true);
  });

  it('keeps a prompt filed under the chosen category', () => {
    expect(matchesCategorySelection(prompt('p1', ['c1']), 'c1', categories)).toBe(true);
    expect(matchesCategorySelection(prompt('p1', ['c2']), 'c1', categories)).toBe(false);
  });

  // The point of letting a prompt carry several: it shows up under each.
  it('keeps a prompt under every category it carries', () => {
    const p = prompt('p1', ['c1', 'c2']);
    expect(matchesCategorySelection(p, 'c1', categories)).toBe(true);
    expect(matchesCategorySelection(p, 'c2', categories)).toBe(true);
  });

  it('keeps a prompt with no categories under "uncategorised"', () => {
    expect(matchesCategorySelection(prompt('p1'), UNCATEGORISED, categories)).toBe(true);
    expect(matchesCategorySelection(prompt('p1', ['c1']), UNCATEGORISED, categories)).toBe(false);
  });

  // Deleting a category leaves its id behind on the prompts. Those prompts must
  // stay reachable rather than vanishing into a heading that no longer exists.
  it('treats an id with no record behind it as uncategorised', () => {
    const orphan = prompt('p1', ['deleted']);
    expect(matchesCategorySelection(orphan, UNCATEGORISED, categories)).toBe(true);
    expect(matchesCategorySelection(orphan, 'deleted', categories)).toBe(false);
    expect(matchesCategorySelection(orphan, ALL_CATEGORIES, categories)).toBe(true);
  });
});

describe('countByCategory', () => {
  it('counts every prompt once under "all"', () => {
    const counts = countByCategory([prompt('p1', ['c1', 'c2']), prompt('p2')], categories);
    expect(counts.all).toBe(2);
  });

  it('counts a prompt under each category it carries', () => {
    const counts = countByCategory([prompt('p1', ['c1', 'c2'])], categories);
    expect(counts.byId.get('c1')).toBe(1);
    expect(counts.byId.get('c2')).toBe(1);
  });

  it('starts every known category at zero, so an empty one still shows', () => {
    const counts = countByCategory([prompt('p1', ['c1'])], categories);
    expect(counts.byId.get('c2')).toBe(0);
  });

  it('counts the ones filed under nothing', () => {
    const counts = countByCategory([prompt('p1'), prompt('p2', ['orphan'])], categories);
    expect(counts.uncategorised).toBe(2);
  });
});

describe('categoryNamesOf', () => {
  it('reads the names through the records, in the sidebar order', () => {
    expect(categoryNamesOf(prompt('p1', ['c2', 'c1']), categories)).toEqual(['Debug', 'Review']);
  });

  it('leaves out an id with no record behind it', () => {
    expect(categoryNamesOf(prompt('p1', ['c1', 'gone']), categories)).toEqual(['Debug']);
  });

  it('has nothing to read for an uncategorised prompt', () => {
    expect(categoryNamesOf(prompt('p1'), categories)).toEqual([]);
  });
});

describe('matchesCategoryName', () => {
  it('matches everything on an empty query', () => {
    expect(matchesCategoryName(prompt('p1'), '', categories)).toBe(true);
  });

  it('matches a prompt through one of its category names', () => {
    expect(matchesCategoryName(prompt('p1', ['c1']), 'deb', categories)).toBe(true);
  });

  it('ignores case', () => {
    expect(matchesCategoryName(prompt('p1', ['c1']), 'DEBUG', categories)).toBe(true);
  });

  it('does not match a prompt filed elsewhere', () => {
    expect(matchesCategoryName(prompt('p1', ['c2']), 'debug', categories)).toBe(false);
    expect(matchesCategoryName(prompt('p1'), 'debug', categories)).toBe(false);
  });
});
