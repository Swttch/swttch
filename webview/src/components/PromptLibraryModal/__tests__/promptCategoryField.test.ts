import { describe, it, expect } from 'vitest';
import { findByName, shouldOfferCreate } from '../PromptCategoryField';
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
