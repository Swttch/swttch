import { describe, it, expect } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { StreamingMessage } from '../StreamingMessage';

/**
 * RTL exception coverage: fenced code blocks, inline code, and KaTeX math
 * must always render LTR even when an ancestor sets `dir="rtl"` (UI
 * mirroring for Persian/Arabic interface languages). Otherwise embedded
 * RTL identifiers/comments make the whole line reorder (punctuation,
 * indentation) via the browser's bidi algorithm.
 *
 * These assertions read real computed styles, which requires vitest to
 * actually process streaming.css during tests (see `test.css.include` in
 * vitest.config.ts) rather than the default "replace CSS with empty
 * string" behavior.
 */
describe('StreamingMessage RTL 예외 처리 (코드/수식은 항상 LTR)', () => {
  const markdown = [
    '```js',
    'const x = 1; // فارسی توضیح',
    '```',
    '',
    '인라인 `code سلام` 텍스트',
    '',
    // `\(…\)`, not `$…$`: a single dollar is deliberately not math (issue #232),
    // so writing the fixture that way would render no `.katex` element at all.
    '\\(x^2\\)',
  ].join('\n');

  function renderInRtlContainer() {
    // `dir="rtl"` models the ambient UI-mirroring context this component
    // actually runs under in production (SettingsContext sets `dir="rtl"`
    // on <html>). Note: jsdom's getComputedStyle does not resolve normal
    // CSS inheritance (a plain nested element with no matching rule reports
    // an empty string, not the inherited/initial value) — so these tests
    // only assert on elements our streaming.css rule directly targets via
    // `[data-streamdown=...]`/`.katex` selectors, not on inheritance from
    // this ancestor.
    return render(
      <div dir="rtl">
        <StreamingMessage content={markdown} isStreaming={false} />
      </div>,
    );
  }

  it('code-block 관련 요소가 RTL 조상 안에서도 direction: ltr로 계산된다', async () => {
    // CodeBlock is React.lazy-loaded by streamdown, so it isn't in the DOM
    // on the synchronous first render — wait for the dynamic import + Shiki
    // highlighting effect to settle.
    const { container } = renderInRtlContainer();

    const codeBlock = await waitFor(() => {
      const el = container.querySelector('[data-streamdown="code-block"]');
      if (!el) throw new Error('code-block not rendered yet');
      return el;
    });
    const codeBlockHeader = container.querySelector('[data-streamdown="code-block-header"]');
    const codeBlockBody = container.querySelector('[data-streamdown="code-block-body"]');

    expect(codeBlock).toBeTruthy();
    expect(codeBlockHeader).toBeTruthy();
    expect(codeBlockBody).toBeTruthy();

    expect(getComputedStyle(codeBlock!).direction).toBe('ltr');
    expect(getComputedStyle(codeBlockHeader!).direction).toBe('ltr');
    expect(getComputedStyle(codeBlockBody!).direction).toBe('ltr');
  });

  it('inline-code가 RTL 문단 중간에서도 direction: ltr + unicode-bidi: isolate로 계산된다', () => {
    const { container } = renderInRtlContainer();

    const inlineCode = container.querySelector('[data-streamdown="inline-code"]');
    expect(inlineCode).toBeTruthy();

    const style = getComputedStyle(inlineCode!);
    expect(style.direction).toBe('ltr');
    expect(style.unicodeBidi).toBe('isolate');
  });

  it('KaTeX 수식이 direction: ltr로 계산된다', () => {
    const { container } = renderInRtlContainer();

    const katex = container.querySelector('.katex');
    expect(katex).toBeTruthy();
    expect(getComputedStyle(katex!).direction).toBe('ltr');
  });
});
