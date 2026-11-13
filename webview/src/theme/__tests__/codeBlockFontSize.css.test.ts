/**
 * Guard for #685: fenced code blocks must follow the Font size setting.
 *
 * The setting only moves the root `rem`. A code block sized in absolute pixels
 * ignores it, so the text around the block grows while the code stays put, and
 * only the UI zoom (which scales pixels too) makes it bigger. jsdom does no
 * layout, so the structural check is on the stylesheet itself.
 */
import { describe, it, expect } from 'vitest';
import streamingCss from '../../pages/ChatPage/streaming.css?raw';

/** Extracts the body of the first CSS block whose selector matches. */
function blockIn(source: string, selectorStartsWith: string): string {
  const start = source.indexOf(selectorStartsWith);
  if (start === -1) throw new Error(`selector not found: ${selectorStartsWith}`);
  const open = source.indexOf('{', start);
  const close = source.indexOf('\n}', open);
  return source.slice(open + 1, close);
}

describe('markdown code block font size (#685)', () => {
  it('sizes the block relative to its text, not in pixels', () => {
    const rule = blockIn(streamingCss, '[data-streamdown="code-block-body"] {');
    const size = rule.match(/font-size:\s*([^;]+);/);
    expect(size).not.toBeNull();
    expect(size![1]).not.toMatch(/px/);
    expect(size![1]).toMatch(/(em|rem)/);
  });

  it('sizes the tokens relative to the block, not in pixels', () => {
    const rule = blockIn(streamingCss, '[data-streamdown="code-block-body"] > code > span > span {');
    expect(rule).not.toMatch(/font-size:\s*[\d.]+px/);
  });
});
