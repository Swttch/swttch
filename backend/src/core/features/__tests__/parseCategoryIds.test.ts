import { describe, it, expect } from 'vitest';
import {
  parseCategoryIds,
  parseCategoryRecords,
  PROMPT_CATEGORY_MAX_LENGTH,
  PROMPT_CATEGORIES_MAX_COUNT,
} from '../prompts';

describe('parseCategoryIds', () => {
  it('keeps well-formed ids', () => {
    expect(parseCategoryIds(['abc-123', 'def-456'])).toEqual(['abc-123', 'def-456']);
  });

  it('has nothing to read when the field is absent or not a list', () => {
    expect(parseCategoryIds(undefined)).toEqual([]);
    expect(parseCategoryIds(null)).toEqual([]);
    expect(parseCategoryIds('abc')).toEqual([]);
  });

  // A name is not an id. An earlier draft wrote names here; they are simply not
  // read, rather than being mistaken for ids.
  it('drops anything that is not shaped like an id', () => {
    expect(parseCategoryIds(['코드 리뷰', 'has spaces', 'abc'])).toEqual(['abc']);
  });

  it('drops entries that are not strings', () => {
    expect(parseCategoryIds(['abc', 42, null, {}])).toEqual(['abc']);
  });

  // One category twice on one prompt would file it under the same heading twice.
  it('collapses duplicates', () => {
    expect(parseCategoryIds(['abc', 'abc'])).toEqual(['abc']);
  });

  it('stops at the count limit', () => {
    const many = Array.from({ length: PROMPT_CATEGORIES_MAX_COUNT + 5 }, (_, i) => `id${i}`);
    expect(parseCategoryIds(many)).toHaveLength(PROMPT_CATEGORIES_MAX_COUNT);
  });
});

describe('parseCategoryRecords', () => {
  const record = (over: Record<string, unknown> = {}) => ({
    id: 'abc',
    name: 'Debug',
    createdAt: 1,
    ...over,
  });

  it('keeps a well-formed record', () => {
    expect(parseCategoryRecords([record()])).toEqual([{ id: 'abc', name: 'Debug', createdAt: 1 }]);
  });

  it('trims the name', () => {
    expect(parseCategoryRecords([record({ name: '  Debug  ' })])[0]?.name).toBe('Debug');
  });

  it('fills in a missing creation time', () => {
    expect(parseCategoryRecords([{ id: 'abc', name: 'Debug' }])[0]?.createdAt).toBe(0);
  });

  it('drops a record with no usable id or name', () => {
    expect(parseCategoryRecords([record({ id: 'has spaces' })])).toEqual([]);
    expect(parseCategoryRecords([record({ name: '   ' })])).toEqual([]);
    expect(parseCategoryRecords([record({ name: 'x'.repeat(PROMPT_CATEGORY_MAX_LENGTH + 1) })])).toEqual([]);
  });

  // Two records under one id would make "which name is it" unanswerable.
  it('keeps only the first record of a repeated id', () => {
    const parsed = parseCategoryRecords([record(), record({ name: 'Other' })]);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.name).toBe('Debug');
  });

  it('has nothing to read when the field is absent', () => {
    expect(parseCategoryRecords(undefined)).toEqual([]);
  });
});
