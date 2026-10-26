import { describe, it, expect } from 'vitest';
import { PAGE_LINK_MESSAGE, linkFromMessage, withLinkGuard } from '../pageLinks';

/** Run the guard in a stand-in for the frame and return what it did with an event. */
function runGuard() {
  const sent: unknown[] = [];
  const listeners: Record<string, (e: unknown) => void> = {};
  const doc = { addEventListener: (type: string, fn: (e: unknown) => void) => { listeners[type] = fn; } };
  const code = /<script>([\s\S]*)<\/script>/.exec(withLinkGuard('<head></head>'))![1];
  new Function('document', 'parent', code)(doc, { postMessage: (m: unknown) => sent.push(m) });
  const link = (href: string, written: string = href) => {
    let prevented = false;
    listeners.click({ target: { closest: () => ({ href, getAttribute: () => written }) }, preventDefault: () => { prevented = true; } });
    return prevented;
  };
  const form = (action: string, method: string, fields: Record<string, string>) => {
    let prevented = false;
    const entries = Object.entries(fields);
    class FD { forEach(fn: (v: unknown, k: string) => void) { entries.forEach(([k, v]) => fn(v, k)); } }
    (globalThis as unknown as { FormData: unknown }).FormData = FD;
    listeners.submit({ target: { action, method, getAttribute: () => action }, preventDefault: () => { prevented = true; } });
    return prevented;
  };
  return { sent, link, form };
}

describe('the link guard', () => {
  it('stops a link to a web address and asks the pane', () => {
    const { sent, link } = runGuard();
    expect(link('https://example.com/a?b=1')).toBe(true);
    expect(sent).toEqual([{ type: PAGE_LINK_MESSAGE, url: 'https://example.com/a?b=1' }]);
  });

  it('leaves alone a link that is not a web address', () => {
    const { sent, link } = runGuard();
    expect(link('mailto:a@b.c')).toBe(false);
    expect(link('about:srcdoc#bottom')).toBe(false);
    // A page in a srcdoc frame resolves "#bottom" to the webview's own address; written as it is, it is no web link.
    expect(link('http://localhost:5593/sessions/x#bottom', '#bottom')).toBe(false);
    expect(link('http://localhost:5593/other.html', 'other.html')).toBe(false);
    expect(sent).toEqual([]);
  });

  it('stops a form sent to a web address, with a GET form\'s fields in the address, and none from a POST', () => {
    const { sent, form } = runGuard();
    expect(form('https://example.com/post', 'get', { q: 'hello' })).toBe(true);
    expect(form('https://example.com/post', 'post', { q: 'hello' })).toBe(true);
    expect(sent).toEqual([
      { type: PAGE_LINK_MESSAGE, url: 'https://example.com/post?q=hello' },
      { type: PAGE_LINK_MESSAGE, url: 'https://example.com/post' },
    ]);
  });
});

describe('linkFromMessage', () => {
  it('accepts only a web address from the guard, in its normal form', () => {
    expect(linkFromMessage({ type: PAGE_LINK_MESSAGE, url: 'https://example.com' })).toBe('https://example.com/');
    expect(linkFromMessage({ type: PAGE_LINK_MESSAGE, url: 'javascript:alert(1)' })).toBeUndefined();
    expect(linkFromMessage({ type: PAGE_LINK_MESSAGE, url: 'file:///etc/passwd' })).toBeUndefined();
    expect(linkFromMessage({ type: 'other', url: 'https://example.com' })).toBeUndefined();
    expect(linkFromMessage(null)).toBeUndefined();
  });
});

describe('withLinkGuard', () => {
  it('goes inside <head>, after the doctype', () => {
    const framed = withLinkGuard('<!doctype html><html><head><title>t</title></head></html>');
    expect(framed.startsWith('<!doctype html>')).toBe(true);
    expect(framed.indexOf('<script>')).toBeLessThan(framed.indexOf('<title>'));
  });
});
