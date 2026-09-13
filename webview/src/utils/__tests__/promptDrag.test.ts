import { describe, it, expect } from 'vitest';
import {
  acceptsDrop,
  categoriesAfterDrop,
  readCategoryDrop,
  readPromptDrag,
} from '../promptDrag';
import { ALL_CATEGORIES, UNCATEGORISED } from '../promptCategories';

describe('categoriesAfterDrop', () => {
  // A prompt can carry several, so a drag says "also this", not "only this".
  // Replacing would silently throw away filing the user had already done.
  it('adds the category rather than replacing what is there', () => {
    expect(categoriesAfterDrop(['c1'], 'c2')).toEqual(['c1', 'c2']);
  });

  it('files an uncategorised prompt', () => {
    expect(categoriesAfterDrop([], 'c1')).toEqual(['c1']);
  });

  // Nothing would change, so nothing should be written.
  it('refuses a category the prompt already carries', () => {
    expect(categoriesAfterDrop(['c1', 'c2'], 'c1')).toBeNull();
  });

  // The way back out. Without it a prompt filed by dragging could only be
  // unfiled through the edit form.
  it('clears every category when dropped on "uncategorised"', () => {
    expect(categoriesAfterDrop(['c1', 'c2'], UNCATEGORISED)).toEqual([]);
  });

  it('refuses "uncategorised" for a prompt that carries nothing already', () => {
    expect(categoriesAfterDrop([], UNCATEGORISED)).toBeNull();
  });

  // "All" is not a category. Refusing is honest; pretending would be worse.
  it('refuses "all", which is not a place to file anything', () => {
    expect(categoriesAfterDrop([], ALL_CATEGORIES)).toBeNull();
    expect(categoriesAfterDrop(['c1'], ALL_CATEGORIES)).toBeNull();
  });

  it('does not mutate the list it was given', () => {
    const current = ['c1'];
    categoriesAfterDrop(current, 'c2');
    expect(current).toEqual(['c1']);
  });
});

describe('acceptsDrop', () => {
  it('agrees with what the drop would actually do', () => {
    expect(acceptsDrop(['c1'], 'c2')).toBe(true);
    expect(acceptsDrop(['c1'], 'c1')).toBe(false);
    expect(acceptsDrop(['c1'], UNCATEGORISED)).toBe(true);
    expect(acceptsDrop([], UNCATEGORISED)).toBe(false);
    expect(acceptsDrop([], ALL_CATEGORIES)).toBe(false);
  });
});

describe('readPromptDrag', () => {
  it('reads a well-formed payload', () => {
    expect(readPromptDrag({ promptId: 'p1', scope: 'global', categories: ['c1'] })).toEqual({
      promptId: 'p1',
      scope: 'global',
      categories: ['c1'],
    });
  });

  it('treats a missing category list as none', () => {
    expect(readPromptDrag({ promptId: 'p1', scope: 'project' })?.categories).toEqual([]);
  });

  // Anything else dragged on the same screen must not be read as a prompt.
  it('refuses a payload that is not one of ours', () => {
    expect(readPromptDrag({ accountId: 'a1' })).toBeNull();
    expect(readPromptDrag({ promptId: 'p1', scope: 'elsewhere' })).toBeNull();
    expect(readPromptDrag(null)).toBeNull();
    expect(readPromptDrag('p1')).toBeNull();
  });
});

describe('readCategoryDrop', () => {
  it('reads a category row', () => {
    expect(readCategoryDrop({ key: 'c1' })).toEqual({ key: 'c1' });
    expect(readCategoryDrop({ key: UNCATEGORISED })).toEqual({ key: UNCATEGORISED });
  });

  it('refuses anything else', () => {
    expect(readCategoryDrop({})).toBeNull();
    expect(readCategoryDrop({ key: 3 })).toBeNull();
    expect(readCategoryDrop(undefined)).toBeNull();
  });
});
