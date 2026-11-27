import { describe, it, expect } from 'vitest';
import { findMarkdownHeadingLine } from '../markdownHeadingLine';

const DOCUMENT = [
  '# Title', // 1
  '', // 2
  '## 3. 数据中心专题索引', // 3
  '```', // 4
  '## Not a heading', // 5
  '```', // 6
  '## `code` & [a link](x.md) here', // 7
  '## Repeat', // 8
  '## Repeat', // 9
  'Setext Title', // 10
  '------------', // 11
  '<a id="custom-anchor"></a>', // 12
  '## 설치 방법 ##', // 13
  '## snake_case_name', // 14
].join('\r\n');

describe('findMarkdownHeadingLine', () => {
  it.each([
    ['title', 1],
    ['3-数据中心专题索引', 3],
    ['code--a-link-here', 7],
    ['repeat', 8],
    ['repeat-1', 9],
    ['setext-title', 10],
    ['custom-anchor', 12],
    ['설치-방법', 13],
    ['snake_case_name', 14],
  ])('finds #%s', (fragment, line) => {
    expect(findMarkdownHeadingLine(DOCUMENT, fragment)).toBe(line);
  });

  it('takes a fragment written with the heading\'s own text', () => {
    expect(findMarkdownHeadingLine(DOCUMENT, '3. 数据中心专题索引')).toBe(3);
  });

  it('finds nothing for a heading inside a code fence or one that is not there', () => {
    expect(findMarkdownHeadingLine(DOCUMENT, 'not-a-heading')).toBeUndefined();
    expect(findMarkdownHeadingLine(DOCUMENT, 'missing')).toBeUndefined();
  });
});
