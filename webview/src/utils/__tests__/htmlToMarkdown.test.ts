import { describe, it, expect } from 'vitest';
import { htmlToMarkdown } from '../htmlToMarkdown';

describe('htmlToMarkdown', () => {
  it('writes headings, paragraphs and emphasis', () => {
    expect(htmlToMarkdown('<h1>Title</h1><p>A <strong>bold</strong> and <em>soft</em> word.</p><h3>Sub</h3>')).toBe(
      '# Title\n\nA **bold** and *soft* word.\n\n### Sub\n',
    );
  });

  it('writes links, inline code and images', () => {
    expect(htmlToMarkdown('<p>See <a href="https://x.dev">the docs</a>, run <code>npm i</code> <img src="a.png" alt="logo"></p>')).toBe(
      'See [the docs](https://x.dev), run `npm i` ![logo](a.png)\n',
    );
  });

  it('writes lists, with nesting and numbers', () => {
    expect(htmlToMarkdown('<ul><li>one<ul><li>inner</li></ul></li><li>two</li></ul><ol><li>a</li><li>b</li></ol>')).toBe(
      '- one\n  - inner\n- two\n\n1. a\n2. b\n',
    );
  });

  it('writes a table with its header row, and a code block, a quote and a rule', () => {
    const md = htmlToMarkdown('<table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table><pre>x = 1\ny = 2</pre><blockquote><p>quoted</p></blockquote><hr>');
    expect(md).toBe('| A | B |\n| --- | --- |\n| 1 | 2 |\n\n```\nx = 1\ny = 2\n```\n\n> quoted\n\n---\n');
  });

  it('drops scripts, styles and the head, and keeps the words of nested blocks', () => {
    expect(htmlToMarkdown('<html><head><title>T</title><style>p{color:red}</style></head><body><script>alert(1)</script><div><p>one</p><div><p>two</p></div></div></body></html>')).toBe('one\n\ntwo\n');
  });

  it('is a single line break for nothing at all', () => {
    expect(htmlToMarkdown('')).toBe('\n');
  });
});
