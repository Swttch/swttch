import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { Streamdown } from 'streamdown';
import { math } from '../mathPlugin';
import { code } from '../codePlugin';

/**
 * `$…$` used to be treated as inline math (issue #232). Text that merely
 * mentions a shell variable or a price was swallowed: the dollars disappeared,
 * the span between them was re-rendered as math, and the sentence around it was
 * duplicated on screen — while every CJK character inside logged a KaTeX
 * `unicodeTextInMathMode` warning.
 */
function renderMarkdown(text: string, plugins: object = { math }) {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const { container } = render(
    <Streamdown mode="static" parseIncompleteMarkdown={false} plugins={plugins}>
      {text}
    </Streamdown>,
  );
  return {
    text: container.textContent ?? '',
    katexCount: container.querySelectorAll('[class*="katex"]').length,
    codeBlockCount: container.querySelectorAll('[data-streamdown="code-block-body"]').length,
    warnCount: warn.mock.calls.length,
  };
}

/**
 * Same as [renderMarkdown], but waits for the code highlighter to finish.
 *
 * With `plugins.code` present, Streamdown renders a spinner skeleton in place
 * of the block while the grammar loads, and only then swaps in the real
 * `code-block-body`. Asserting synchronously would read that placeholder — an
 * empty `textContent` — and look like the fence vanished.
 */
async function renderMarkdownWithCode(text: string, plugins: object) {
  const result = renderMarkdown(text, plugins);
  await waitFor(() => {
    expect(document.querySelectorAll('[data-streamdown="code-block-body"]').length)
      .toBeGreaterThan(0);
  });
  const container = document.body;
  return {
    ...result,
    text: container.textContent ?? '',
    katexCount: container.querySelectorAll('[class*="katex"]').length,
    codeBlockCount: container.querySelectorAll('[data-streamdown="code-block-body"]').length,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('math plugin — single dollar is not math (issue #232)', () => {
  it('keeps a shell-variable sentence intact instead of duplicating it', () => {
    const source = '看有没有 $VAR 会被当变量展开（值为空）。模板含 $NAME 它。';
    const { text, warnCount } = renderMarkdown(source);

    expect(text).toContain('$VAR');
    expect(text).toContain('$NAME');
    // The clause between the two dollars used to appear three times over.
    expect(text.split('会被当变量展开').length - 1).toBe(1);
    expect(warnCount).toBe(0);
  });

  it('does not duplicate text around two dollars on one line', () => {
    const { text, warnCount } = renderMarkdown('占位符返回字符串 $a 的绑定对 $b 实际上对属性单个。');
    expect(text.split('的绑定对').length - 1).toBe(1);
    expect(warnCount).toBe(0);
  });

  it('leaves a price untouched', () => {
    const { text } = renderMarkdown('价格是 $100 元，折扣后 $80 元。');
    expect(text).toContain('$100');
    expect(text).toContain('$80');
  });

  it('still renders block math written with $$', () => {
    const { katexCount } = renderMarkdown('$$\nE = mc^2\n$$');
    expect(katexCount).toBeGreaterThan(0);
  });

  it('still renders inline math written with \\( \\)', () => {
    const { katexCount } = renderMarkdown('质能方程 \\(E = mc^2\\) 很有名。');
    expect(katexCount).toBeGreaterThan(0);
  });
});

/**
 * The cases above render with `plugins={{ math }}` alone, but the chat now
 * passes `{ math, code }` — a syntax highlighter was added for issue #282, and
 * both plugins share one `plugins` object and one markdown pipeline. Re-running
 * the same expectations in that combination is what proves the highlighter did
 * not disturb the `$`-handling those cases were written to protect.
 */
describe('math still behaves once the code highlighter is plugged in (#282)', () => {
  const both = { math, code };

  it('leaves shell variables and prices alone', () => {
    const { text, warnCount } = renderMarkdown(
      '看有没有 $VAR 会被当变量展开（值为空）。价格是 $100 元。',
      both,
    );

    expect(text).toContain('$VAR');
    expect(text).toContain('$100');
    expect(text.split('会被当变量展开').length - 1).toBe(1);
    expect(warnCount).toBe(0);
  });

  it('still renders both math syntaxes', () => {
    expect(renderMarkdown('$$\nE = mc^2\n$$', both).katexCount).toBeGreaterThan(0);
    expect(renderMarkdown('质能方程 \\(E = mc^2\\) 很有名。', both).katexCount).toBeGreaterThan(0);
  });

  it('renders math and a fenced code block in one document', async () => {
    // The realistic shape of an answer that explains a formula and then shows
    // code — the two plugins have to coexist within a single parse.
    const source = [
      '质能方程 \\(E = mc^2\\) 很有名。',
      '',
      '```python',
      'energy = mass * c ** 2',
      '```',
      '',
      '$$',
      'E = mc^2',
      '$$',
    ].join('\n');

    const { katexCount, codeBlockCount, text } = await renderMarkdownWithCode(source, both);

    expect(katexCount).toBeGreaterThan(0);
    expect(codeBlockCount).toBe(1);
    // The fence must stay code, not get swallowed as math or duplicated.
    expect(text).toContain('energy');
    expect(text.split('energy').length - 1).toBe(1);
  });

  it('does not treat a dollar inside a code fence as math', async () => {
    const source = ['```bash', 'echo "$HOME and $PATH"', '```'].join('\n');
    const { text, katexCount, warnCount } = await renderMarkdownWithCode(source, both);

    expect(text).toContain('$HOME');
    expect(text).toContain('$PATH');
    expect(katexCount).toBe(0);
    expect(warnCount).toBe(0);
  });
});
