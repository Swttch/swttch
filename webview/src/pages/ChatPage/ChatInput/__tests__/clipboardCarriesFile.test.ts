/**
 * Tests for clipboardCarriesFile, the composer's sole reason to intercept a
 * paste.
 *
 * The regression this guards (issue #286): the composer used to cancel EVERY
 * text paste and write the result through React state. That produced the right
 * glyphs but bypassed the browser's undo stack, so Cmd/Ctrl+Z could not undo a
 * paste while text typed afterwards undid normally. Text must therefore report
 * `false` here, so the caller leaves the event alone and the browser's own
 * paste (which records an undo entry) runs.
 *
 * jsdom's DataTransfer does not expose a settable `items` list, so the tests
 * build minimal stand-ins with just the two fields the predicate reads.
 */

import { describe, it, expect } from 'vitest';
import { clipboardCarriesFile } from '../clipboardCarriesFile';

/** Build a DataTransfer-shaped stub carrying the given items. */
function clipboardWith(items: Array<{ kind: string; type: string }>): DataTransfer {
  return { items } as unknown as DataTransfer;
}

describe('clipboardCarriesFile', () => {
  it('reports false for a plain-text paste, so the browser handles it and undo works', () => {
    const clipboard = clipboardWith([{ kind: 'string', type: 'text/plain' }]);
    expect(clipboardCarriesFile(clipboard)).toBe(false);
  });

  it('reports false for rich text, which plaintext-only strips on its own', () => {
    const clipboard = clipboardWith([
      { kind: 'string', type: 'text/plain' },
      { kind: 'string', type: 'text/html' },
    ]);
    expect(clipboardCarriesFile(clipboard)).toBe(false);
  });

  it('reports true for a pasted image file, which becomes an attachment', () => {
    const clipboard = clipboardWith([{ kind: 'file', type: 'image/png' }]);
    expect(clipboardCarriesFile(clipboard)).toBe(true);
  });

  it('reports true when a file rides alongside text', () => {
    const clipboard = clipboardWith([
      { kind: 'string', type: 'text/plain' },
      { kind: 'file', type: 'image/jpeg' },
    ]);
    expect(clipboardCarriesFile(clipboard)).toBe(true);
  });

  it.each(['application/pdf', 'video/quicktime', ''])('reports true for a file of type "%s", whatever it is', (type) => {
    // Finder gives a copied folder or an unknown extension an empty type; none
    // of them may be left to the editor, which would paste only the file name.
    expect(clipboardCarriesFile(clipboardWith([{ kind: 'file', type }]))).toBe(true);
  });

  it('reports false for an image MIME type that is not an actual file', () => {
    // A dragged <img> can surface as a string entry; only real files become
    // attachments, so this must not divert the paste.
    const clipboard = clipboardWith([{ kind: 'string', type: 'image/png' }]);
    expect(clipboardCarriesFile(clipboard)).toBe(false);
  });

  it('reports false when the clipboard is null', () => {
    expect(clipboardCarriesFile(null)).toBe(false);
  });

  it('reports false when the clipboard exposes no items', () => {
    expect(clipboardCarriesFile({} as unknown as DataTransfer)).toBe(false);
  });
});
