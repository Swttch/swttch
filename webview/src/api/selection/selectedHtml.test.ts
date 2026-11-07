import { afterEach, describe, expect, it } from 'vitest';
import { selectedHtml } from './selectedHtml';

function select(node: Node): void {
  const range = document.createRange();
  range.selectNodeContents(node);
  const selection = window.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
}

afterEach(() => {
  window.getSelection()?.removeAllRanges();
  document.body.innerHTML = '';
});

describe('selectedHtml', () => {
  it('gives the selection with its formatting', () => {
    document.body.innerHTML = '<div id="root"><p>a <strong>b</strong></p><ol><li>one</li></ol></div>';
    select(document.getElementById('root')!);

    expect(selectedHtml(document)).toBe('<p>a <strong>b</strong></p><ol><li>one</li></ol>');
  });

  it('gives nothing when nothing is selected', () => {
    document.body.innerHTML = '<p>text</p>';

    expect(selectedHtml(document)).toBeUndefined();
  });

  it('gives nothing for a selection inside a text field, which has no formatting to keep', () => {
    document.body.innerHTML = '<input id="field" value="typed words" />';
    const field = document.getElementById('field') as HTMLInputElement;
    field.focus();
    field.setSelectionRange(0, 5);

    expect(selectedHtml(document)).toBeUndefined();
  });

  it('keeps the lines of a code block apart for a program that has no stylesheet to make them blocks (#648)', () => {
    document.body.innerHTML =
      '<div id="root"><pre><code>' +
      '<span class="block"><span>def</span><span> greet():</span></span>' +
      '<span class="block"><span>    return 1</span></span>' +
      '</code></pre></div>';
    select(document.getElementById('root')!);

    expect(selectedHtml(document)).toBe('<pre><code>def greet():\n    return 1</code></pre>');
  });

  it('keeps the lines apart when the selection starts and ends inside one code block (#648)', () => {
    document.body.innerHTML =
      '<pre><code id="code">' +
      '<span class="block"><span>one</span></span>' +
      '<span class="block"><span>two</span></span>' +
      '<span class="block"><span>three</span></span>' +
      '</code></pre>';
    const code = document.getElementById('code')!;
    const range = document.createRange();
    range.setStart(code.children[0].firstChild!.firstChild!, 1);
    range.setEnd(code.children[2].firstChild!.firstChild!, 3);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);

    expect(selectedHtml(document)).toBe('<pre><code>ne\ntwo\nthr</code></pre>');
  });

  it('keeps a token that is only a space and the indent of a line, which a program that pastes drops from an element (#648)', () => {
    document.body.innerHTML =
      '<div id="root"><pre><code>' +
      '<span class="block"><span>def</span><span> </span><span>greet</span></span>' +
      '<span class="block"><span>    return</span><span> </span><span>1</span></span>' +
      '</code></pre></div>';
    select(document.getElementById('root')!);

    expect(selectedHtml(document)).toBe('<pre><code>def greet\n    return 1</code></pre>');
  });

  it('leaves out the top bar of a code block, which holds the language name and the copy button, not code (#648)', () => {
    document.body.innerHTML =
      '<div id="root"><div data-streamdown="code-block">' +
      '<div data-streamdown="code-block-header"><span>python</span><button>copy</button></div>' +
      '<pre><code><span class="block">a</span><span class="block">b</span></code></pre>' +
      '</div></div>';
    select(document.getElementById('root')!);

    expect(selectedHtml(document)).toBe(
      '<div data-streamdown="code-block"><pre><code>a\nb</code></pre></div>',
    );
  });

  it('leaves out what the page marks as drawn around the content, such as the line under a message (#648)', () => {
    document.body.innerHTML =
      '<div id="root"><p>the reply</p><div data-copy-ignore="true"><button>copy</button>(Sat) 8:32 PM</div></div>';
    select(document.getElementById('root')!);

    expect(selectedHtml(document)).toBe('<p>the reply</p>');
  });

  it('writes bold, slant and underline into the style of what a class makes so, which a program that pastes cannot see (#648)', () => {
    document.body.innerHTML =
      '<style>.heavy{font-weight:600}.slant{font-style:italic}.under{text-decoration:underline}</style>' +
      '<div id="root"><p><span class="heavy">bold</span> <span class="slant">slanted</span> ' +
      '<span class="under">under</span> <span>plain</span></p></div>';
    select(document.getElementById('root')!);

    const html = selectedHtml(document)!;

    expect(html).toContain('<span class="heavy" style="font-weight: bold;">bold</span>');
    expect(html).toContain('<span class="slant" style="font-style: italic;">slanted</span>');
    expect(html).toContain('<span class="under" style="text-decoration: underline;">under</span>');
    expect(html).toContain('<span>plain</span>');
  });

  it('writes the slant of a quote that gets it from its own class', () => {
    document.body.innerHTML =
      '<style>.quote{font-style:italic}</style><div id="root"><blockquote class="quote">said</blockquote></div>';
    select(document.getElementById('root')!);

    expect(selectedHtml(document)).toBe('<blockquote class="quote" style="font-style: italic;">said</blockquote>');
  });

  it('keeps the slant for a few words picked from inside a quote, which are copied without the quote around them (#648)', () => {
    document.body.innerHTML =
      '<style>.quote{font-style:italic}</style><div><blockquote class="quote" id="quote">said something</blockquote></div>';
    const text = document.getElementById('quote')!.firstChild!;
    const range = document.createRange();
    range.setStart(text, 5);
    range.setEnd(text, 14);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);

    expect(selectedHtml(document)).toBe('<span style="font-style: italic;">something</span>');
  });

  it('adds no wrapper for a few words picked from plain text', () => {
    document.body.innerHTML = '<p id="plain">said something</p>';
    const text = document.getElementById('plain')!.firstChild!;
    const range = document.createRange();
    range.setStart(text, 5);
    range.setEnd(text, 14);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);

    expect(selectedHtml(document)).toBe('something');
  });

  it('leaves a part of one code line as it is', () => {
    document.body.innerHTML =
      '<pre><code><span class="block"><span id="word">identifier</span></span></code></pre>';
    const word = document.getElementById('word')!.firstChild!;
    const range = document.createRange();
    range.setStart(word, 2);
    range.setEnd(word, 6);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);

    expect(selectedHtml(document)).toBe('enti');
  });

  it('leaves a code block alone when its children are not lines', () => {
    document.body.innerHTML = '<div id="root"><pre><code><span>a</span><span>b</span></code></pre></div>';
    select(document.getElementById('root')!);

    expect(selectedHtml(document)).toBe('<pre><code><span>a</span><span>b</span></code></pre>');
  });
});
