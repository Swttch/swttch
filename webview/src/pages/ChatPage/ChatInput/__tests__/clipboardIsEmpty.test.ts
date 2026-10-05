/**
 * Tests for clipboardIsEmpty, which decides when the composer asks the IDE host
 * for the clipboard (#278).
 *
 * The cost of a wrong answer is lopsided. Calling a paste "empty" when it carried
 * something cancels the browser's own paste, which records an undo entry and
 * handles formatting (issue #286), and the host's answer then replaces it. So
 * every paste that carries anything must report `false` here.
 *
 * jsdom's DataTransfer cannot be filled, so the tests build stand-ins with just
 * the two members the predicate reads.
 */

import { describe, it, expect } from 'vitest';
import { clipboardIsEmpty } from '../clipboardIsEmpty';

/** A DataTransfer-shaped stub holding the given types, each with its string. */
function clipboardWith(entries: Record<string, string>): DataTransfer {
  return {
    types: Object.keys(entries),
    getData: (type: string) => entries[type] ?? '',
  } as unknown as DataTransfer;
}

describe('clipboardIsEmpty', () => {
  it('reports true for a paste that carries nothing, which is how a Wayland IDE window looks to the browser', () => {
    expect(clipboardIsEmpty(clipboardWith({}))).toBe(true);
  });

  it('reports true when the only entries are empty strings', () => {
    expect(clipboardIsEmpty(clipboardWith({ 'text/plain': '', 'text/html': '' }))).toBe(true);
  });

  it('reports false for text, so the browser pastes it and undo works', () => {
    expect(clipboardIsEmpty(clipboardWith({ 'text/plain': 'hello' }))).toBe(false);
  });

  it('reports false for markup alone', () => {
    expect(clipboardIsEmpty(clipboardWith({ 'text/html': '<b>hello</b>' }))).toBe(false);
  });

  it('reports false for a pasted file, which the image path handles', () => {
    expect(clipboardIsEmpty(clipboardWith({ Files: '' }))).toBe(false);
  });

  it('reports false when there is no event data to look at, leaving the browser alone', () => {
    expect(clipboardIsEmpty(null)).toBe(false);
  });
});
