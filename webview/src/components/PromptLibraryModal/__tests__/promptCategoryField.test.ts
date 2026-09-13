import { describe, it, expect } from 'vitest';
import {
  CREATE_OPTION,
  backspaceRemovesLastChip,
  buildCategoryItems,
  enterCreatesDirectly,
  highlightAfterTab,
  findByName,
  shouldOfferCreate,
} from '../PromptCategoryField';
import type { PromptCategory } from '@/types/prompt';

const category = (id: string, name: string): PromptCategory => ({ id, name, createdAt: 1 });
const categories = [category('c1', 'Review'), category('c2', '디버깅')];

/**
 * The rule that decides whether typed text is a new category or one that
 * already exists. It has to agree with the backend registry, which refuses to
 * make a second "review" beside "Review" — offering to create one anyway would
 * promise something the save then quietly does not do.
 */
describe('findByName', () => {
  it('finds a category whatever the case', () => {
    expect(findByName(categories, 'review')?.id).toBe('c1');
    expect(findByName(categories, 'REVIEW')?.id).toBe('c1');
  });

  it('ignores the spaces around what was typed', () => {
    expect(findByName(categories, '  Review  ')?.id).toBe('c1');
  });

  it('finds a non-Latin name too', () => {
    expect(findByName(categories, '디버깅')?.id).toBe('c2');
  });

  it('finds nothing for a name nobody has', () => {
    expect(findByName(categories, 'Docs')).toBeUndefined();
  });

  it('finds nothing for an empty query, rather than the first row', () => {
    expect(findByName(categories, '')).toBeUndefined();
    expect(findByName(categories, '   ')).toBeUndefined();
  });
});

describe('shouldOfferCreate', () => {
  it('offers to create a name that does not exist yet', () => {
    expect(shouldOfferCreate(categories, 'Docs')).toBe(true);
  });

  // Otherwise the row invites the user to make a duplicate that the backend
  // will fold into the one they already have.
  it('does not offer to create one that already exists, whatever the case', () => {
    expect(shouldOfferCreate(categories, 'Review')).toBe(false);
    expect(shouldOfferCreate(categories, 'review')).toBe(false);
    expect(shouldOfferCreate(categories, '  review ')).toBe(false);
  });

  it('offers nothing while the box is empty', () => {
    expect(shouldOfferCreate(categories, '')).toBe(false);
    expect(shouldOfferCreate(categories, '   ')).toBe(false);
  });

  it('offers to create the first category of an empty library', () => {
    expect(shouldOfferCreate([], 'Review')).toBe(true);
  });
});

/**
 * Issue #430 follow-up — typing a new name and pressing Enter cleared the box
 * and made nothing, while clicking the very same row worked. Selecting with
 * Enter resolves the highlighted row through the collection, so the create row
 * has to BE in the collection rather than merely be drawn next to it.
 */
describe('buildCategoryItems', () => {
  it('ends with the create row when the typed name is new', () => {
    const items = buildCategoryItems(categories, 'Docs');

    expect(items[items.length - 1]).toMatchObject({ id: CREATE_OPTION, name: 'Docs' });
  });

  it('carries the typed name on the create row, so the selection knows it', () => {
    const items = buildCategoryItems([], '  Release notes  ');

    expect(items).toEqual([{ id: CREATE_OPTION, name: 'Release notes', createdAt: 0 }]);
  });

  it('offers no create row for a name that already exists', () => {
    const items = buildCategoryItems(categories, 'review');

    expect(items.some((item) => item.id === CREATE_OPTION)).toBe(false);
  });

  it('narrows to the categories that match what was typed', () => {
    expect(buildCategoryItems(categories, 'rev').map((item) => item.id)).toEqual([
      'c1',
      CREATE_OPTION,
    ]);
  });

  it('offers everything, and nothing to create, while the box is empty', () => {
    expect(buildCategoryItems(categories, '')).toEqual(categories);
  });
});

describe('backspaceRemovesLastChip', () => {
  it('takes the last chip off when the box is empty', () => {
    expect(backspaceRemovesLastChip('', ['c1', 'c2'])).toBe(true);
  });

  // There is text to edit, and eating a chip instead would destroy a pick the
  // user never asked to undo.
  it('leaves the chips alone while there is text to delete', () => {
    expect(backspaceRemovesLastChip('a', ['c1'])).toBe(false);
  });

  it('does nothing when there are no chips to take off', () => {
    expect(backspaceRemovesLastChip('', [])).toBe(false);
  });
});

const createRow = { id: CREATE_OPTION, name: 'Docs', createdAt: 0 };

/**
 * Issue #430 follow-up — creating a new category took THREE keys: type the
 * name, arrow down onto a row that says the name back, then Enter. With the
 * caret sitting after what they typed, the user already means that text.
 */
describe('enterCreatesDirectly', () => {
  it('creates the typed name when nothing is highlighted', () => {
    expect(enterCreatesDirectly([createRow], null)).toBe(true);
  });

  // Enter belongs to whatever is highlighted; stealing it would pick the wrong
  // one whenever the user had already arrowed onto an existing category.
  it('leaves Enter to the highlighted row', () => {
    expect(enterCreatesDirectly([createRow], CREATE_OPTION)).toBe(false);
    expect(enterCreatesDirectly([category('c1', 'Review'), createRow], 'c1')).toBe(false);
  });

  it('does nothing when there is no create row to reach', () => {
    expect(enterCreatesDirectly([category('c1', 'Review')], null)).toBe(false);
    expect(enterCreatesDirectly([], null)).toBe(false);
  });
});

describe('highlightAfterTab', () => {
  const items = [category('c1', 'Review'), createRow];

  it('walks onto the first row from nothing, the way the down arrow does', () => {
    expect(highlightAfterTab(items, null, false)).toBe('c1');
  });

  it('walks to the next row', () => {
    expect(highlightAfterTab(items, 'c1', false)).toBe(CREATE_OPTION);
  });

  it('walks backwards on shift', () => {
    expect(highlightAfterTab(items, CREATE_OPTION, true)).toBe('c1');
    expect(highlightAfterTab(items, null, true)).toBe(CREATE_OPTION);
  });

  // Past either end Tab has to go back to meaning "leave this field", or the
  // keyboard user is trapped in the menu.
  it('gives Tab back once the walk runs off the end', () => {
    expect(highlightAfterTab(items, CREATE_OPTION, false)).toBeNull();
    expect(highlightAfterTab(items, 'c1', true)).toBeNull();
  });

  it('never takes Tab when there is nothing to walk', () => {
    expect(highlightAfterTab([], null, false)).toBeNull();
  });
});
