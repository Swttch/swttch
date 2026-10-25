import { afterEach, describe, expect, it, vi } from 'vitest';
import { metaContent, readLinkPreview, titleOf } from '../linkPreview';

const PAGE = `<!doctype html><html><head>
<title>  Plain &amp; title </title>
<meta property="og:title" content="Show Artifacts &amp; rich content">
<meta name='twitter:image' content='/img/card.png'>
<meta property="og:image" content="https://cdn.example.com/og.png">
</head><body></body></html>`;

function htmlResponse(body: string, type = 'text/html; charset=utf-8'): Response {
  return new Response(body, { status: 200, headers: { 'content-type': type } });
}
const pngResponse = () => new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'image/png' } });

afterEach(() => vi.unstubAllGlobals());

describe('reading a page for its card', () => {
  it('finds the title and meta content, decoding entities', () => {
    expect(titleOf(PAGE)).toBe('Show Artifacts & rich content');
    expect(titleOf('<title>\n Plain &amp; title </title>')).toBe('Plain & title');
    expect(metaContent(PAGE, 'twitter:image')).toBe('/img/card.png');
    expect(metaContent(PAGE, 'og:description')).toBeUndefined();
  });

  it('carries the title, the site and the page image as a data URL', async () => {
    const fetchMock = vi.fn(async (url: string) => (url.endsWith('.png') ? pngResponse() : htmlResponse(PAGE)));
    vi.stubGlobal('fetch', fetchMock);

    const card = await readLinkPreview('https://www.github.com/Swttch/swttch/issues/593');

    expect(card).toEqual({
      url: 'https://www.github.com/Swttch/swttch/issues/593',
      host: 'github.com',
      title: 'Show Artifacts & rich content',
      image: `data:image/png;base64,${Buffer.from([1, 2, 3]).toString('base64')}`,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('keeps the title when the picture cannot be had', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (url.endsWith('.png') ? new Response('', { status: 404 }) : htmlResponse(PAGE))));
    expect(await readLinkPreview('https://a.example/p')).toMatchObject({ title: 'Show Artifacts & rich content' });
    expect((await readLinkPreview('https://a.example/p')).image).toBeUndefined();
  });

  it('answers only the site for a page that is not HTML or cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => htmlResponse('x', 'application/json')));
    expect(await readLinkPreview('https://a.example/data')).toEqual({ url: 'https://a.example/data', host: 'a.example' });

    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    expect(await readLinkPreview('https://a.example/p')).toEqual({ url: 'https://a.example/p', host: 'a.example' });
  });

  it('reads nothing for an address that is not http or https', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await readLinkPreview('file:///etc/passwd')).toEqual({ url: 'file:///etc/passwd', host: '' });
    expect(await readLinkPreview('not a url')).toEqual({ url: 'not a url', host: '' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('skips a page image that is not a picture type, and one that is too large', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (url.endsWith('.png') ? new Response('<svg/>', { headers: { 'content-type': 'image/svg+xml' } }) : htmlResponse(PAGE))));
    expect((await readLinkPreview('https://a.example/p')).image).toBeUndefined();

    vi.stubGlobal('fetch', vi.fn(async (url: string) => (url.endsWith('.png') ? new Response(new Uint8Array(1024 * 1024 + 1), { headers: { 'content-type': 'image/png' } }) : htmlResponse(PAGE))));
    expect((await readLinkPreview('https://a.example/p')).image).toBeUndefined();
  });
});
