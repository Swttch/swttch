import { afterEach, describe, expect, it } from 'vitest';
import { collectMatches } from '../collectMatches';

function mount(html: string): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = html;
  document.body.appendChild(root);
  return root;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('collectMatches', () => {
  it('finds every occurrence, ignoring case, in document order', () => {
    const root = mount('<p>Hello hello</p><p>say HELLO</p>');
    const matches = collectMatches(root, 'hello');
    expect(matches.map((m) => m.range.toString())).toEqual(['Hello', 'hello', 'HELLO']);
  });

  it('returns nothing for an empty query', () => {
    expect(collectMatches(mount('<p>abc</p>'), '')).toEqual([]);
  });

  it('does not search the find bar itself or form fields', () => {
    const root = mount('<div data-chat-search-skip>needle</div><textarea>needle</textarea><p>needle</p>');
    expect(collectMatches(root, 'needle')).toHaveLength(1);
  });

  it('names the folded section holding a match, and only for folded ones', () => {
    const root = mount(
      '<div data-send-section="a"><div data-section-body style="display: none">needle</div></div>' +
        '<div data-send-section="b"><div data-section-body>needle</div></div>',
    );
    const matches = collectMatches(root, 'needle');
    expect(matches.map((m) => m.foldedSectionKey)).toEqual(['a', null]);
  });

  it('stops at the limit', () => {
    const root = mount('<p>aaaaaa</p>');
    expect(collectMatches(root, 'a', 3)).toHaveLength(3);
  });
});
