import { describe, it, expect, vi, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { Streamdown } from 'streamdown';
import { math } from '../mathPlugin';

/**
 * `$…$` used to be treated as inline math (issue #232). Text that merely
 * mentions a shell variable or a price was swallowed: the dollars disappeared,
 * the span between them was re-rendered as math, and the sentence around it was
 * duplicated on screen — while every CJK character inside logged a KaTeX
 * `unicodeTextInMathMode` warning.
 */
function renderMarkdown(text: string) {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const { container } = render(
    <Streamdown mode="static" parseIncompleteMarkdown={false} plugins={{ math }}>
      {text}
    </Streamdown>,
  );
  return {
    text: container.textContent ?? '',
    katexCount: container.querySelectorAll('[class*="katex"]').length,
    warnCount: warn.mock.calls.length,
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
