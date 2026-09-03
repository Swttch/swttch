import { describe, it, expect, beforeEach } from 'vitest';
import { persistSortOrder, readSortOrder } from '../sortOrderStorage';

describe('sortOrderStorage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('defaults to recent when nothing was ever chosen', () => {
    expect(readSortOrder()).toBe('recent');
  });

  it('reads back what was persisted', () => {
    persistSortOrder('created');
    expect(readSortOrder()).toBe('created');
  });

  it('falls back to recent for a value it does not recognize', () => {
    localStorage.setItem('claude-code-gui:project-selector:sort-order', 'alphabetical');
    expect(readSortOrder()).toBe('recent');
  });
});
