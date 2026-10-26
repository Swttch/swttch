import { describe, it, expect, beforeEach } from 'vitest';
import { PAGE_STORAGE_MESSAGE, _resetPageStorage, applyStorageMessage, storedFor, withStorageShim } from '../pageStorage';

/** Run the shim the way the frame does, with stand-ins for what it reaches for. */
function runShim(initial: Record<string, string>) {
  const html = withStorageShim('<!doctype html><html><head><title>t</title></head><body></body></html>', initial);
  const code = /<script>([\s\S]*)<\/script>/.exec(html)![1];
  const sent: unknown[] = [];
  const fakeWindow: Record<string, unknown> = {};
  class FakeDocument {}
  new Function('window', 'parent', 'Document', code)(fakeWindow, { postMessage: (m: unknown) => sent.push(m) }, FakeDocument);
  return { window: fakeWindow as { localStorage: Storage; sessionStorage: Storage }, sent, doc: new FakeDocument() as { cookie: string } };
}

beforeEach(() => _resetPageStorage());

describe('withStorageShim', () => {
  it('goes first inside <head>, so it runs before the page, and never before the doctype', () => {
    const framed = withStorageShim('<!doctype html><html><head><meta charset="utf-8"></head><body>x</body></html>', {});
    expect(framed.startsWith('<!doctype html>')).toBe(true);
    expect(framed.indexOf('<script>')).toBeGreaterThan(framed.indexOf('<head>'));
    expect(framed.indexOf('<script>')).toBeLessThan(framed.indexOf('<meta'));
  });

  it('finds a place in a page with no head, with no html tag, and with nothing at all', () => {
    expect(withStorageShim('<html><body>x</body></html>', {}).indexOf('<script>')).toBe('<html>'.length);
    expect(withStorageShim('<!DOCTYPE html><p>x</p>', {}).indexOf('<script>')).toBe('<!DOCTYPE html>'.length);
    expect(withStorageShim('<p>x</p>', {}).startsWith('<script>')).toBe(true);
  });

  it('cannot be broken out of by a stored value that holds a closing script tag', () => {
    const framed = withStorageShim('<head></head>', { k: '</script><script>alert(1)</script>' });
    expect(framed.match(/<\/script>/g)).toHaveLength(1);
  });
});

describe('the storage the page is handed', () => {
  it('works like localStorage, starts from what was kept, and tells the pane what changed', () => {
    const { window, sent } = runShim({ old: 'kept' });
    const ls = window.localStorage;
    expect(ls.getItem('old')).toBe('kept');
    ls.setItem('k', 'v');
    expect(ls.getItem('k')).toBe('v');
    expect(ls.length).toBe(2);
    expect(ls.key(0)).toBe('old');
    ls.removeItem('old');
    expect(ls.getItem('old')).toBeNull();
    ls.clear();
    expect(ls.length).toBe(0);
    expect(sent).toEqual([
      { type: PAGE_STORAGE_MESSAGE, op: 'set', key: 'k', value: 'v' },
      { type: PAGE_STORAGE_MESSAGE, op: 'remove', key: 'old', value: undefined },
      { type: PAGE_STORAGE_MESSAGE, op: 'clear', key: undefined, value: undefined },
    ]);
  });

  it('can be used as an object too, and turns values into strings', () => {
    const { window } = runShim({});
    const ls = window.localStorage as unknown as Record<string, unknown>;
    ls.count = 3;
    expect(ls.count).toBe('3');
    expect(Object.keys(ls)).toEqual(['count']);
  });

  it('keeps sessionStorage to the page, without telling the pane', () => {
    const { window, sent } = runShim({});
    window.sessionStorage.setItem('a', 'b');
    expect(window.sessionStorage.getItem('a')).toBe('b');
    expect(sent).toEqual([]);
  });

  it('reads cookies as empty and ignores writes, without an error', () => {
    const { doc } = runShim({});
    expect(() => { doc.cookie = 'c=1'; }).not.toThrow();
    expect(doc.cookie).toBe('');
  });
});

describe('what the pane keeps', () => {
  it('follows the changes a page reports, per file', () => {
    applyStorageMessage('/p/a.html', { type: PAGE_STORAGE_MESSAGE, op: 'set', key: 'k', value: 'v' });
    applyStorageMessage('/p/b.html', { type: PAGE_STORAGE_MESSAGE, op: 'set', key: 'other', value: '1' });
    expect(storedFor('/p/a.html')).toEqual({ k: 'v' });
    applyStorageMessage('/p/a.html', { type: PAGE_STORAGE_MESSAGE, op: 'remove', key: 'k' });
    expect(storedFor('/p/a.html')).toEqual({});
    applyStorageMessage('/p/b.html', { type: PAGE_STORAGE_MESSAGE, op: 'clear' });
    expect(storedFor('/p/b.html')).toEqual({});
  });

  it('ignores a message that is not a change, and a change that would pass the limit', () => {
    applyStorageMessage('/p/a.html', { type: 'something-else', op: 'set', key: 'k', value: 'v' });
    applyStorageMessage('/p/a.html', { type: PAGE_STORAGE_MESSAGE, op: 'set', key: 1, value: 'v' });
    applyStorageMessage('/p/a.html', { type: PAGE_STORAGE_MESSAGE, op: 'set', key: 'big', value: 'x'.repeat(2_000_001) });
    applyStorageMessage('/p/a.html', null);
    expect(storedFor('/p/a.html')).toEqual({});
  });
});
