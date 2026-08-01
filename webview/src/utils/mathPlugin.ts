import remarkMath from 'remark-math-extended';
import rehypeKatex from 'rehype-katex';
import type { MathPlugin } from 'streamdown';

export const math: MathPlugin = {
    name: 'katex',
    type: 'math',
    // `$…$` is NOT treated as math (issue #232).
    //
    // A single dollar is far more often a shell variable or a price than an
    // equation, and misreading one is not a cosmetic slip: the delimiters are
    // eaten, the span between them is re-rendered as math, and the surrounding
    // sentence is duplicated on screen. A report about `$VAR` expansion came out
    // mangled, with the passage repeated three times — and every CJK character
    // caught in the span logged a `unicodeTextInMathMode` warning, thousands of
    // which buried the rest of that session's console log.
    //
    // `$$…$$` and `\(…\)` still render, so deliberate math is unaffected; only
    // the ambiguous single-dollar form is given up.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    remarkPlugin: [remarkMath, { singleDollarTextMath: false }] as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rehypePlugin: [rehypeKatex, { errorColor: 'var(--color-muted-foreground)' }] as any,
};
