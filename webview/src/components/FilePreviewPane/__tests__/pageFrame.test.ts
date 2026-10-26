import { describe, it, expect } from 'vitest';
import { frameDocument, pageSource } from '../pageFrame';

const PAGE = '<!doctype html><html><head><title>t</title></head><body>x</body></html>';

describe('pageSource', () => {
  it('is local when the webview is opened on this machine, remote when it is not', () => {
    expect(pageSource('localhost')).toBe('local');
    expect(pageSource('127.0.0.1')).toBe('local');
    expect(pageSource('abc.trycloudflare.com')).toBe('remote');
    expect(pageSource('192.168.0.5')).toBe('remote');
  });
});

describe('frameDocument', () => {
  it('for a local file asks where a link goes, keeps pictures and gives no storage', () => {
    const doc = frameDocument(PAGE, 'local', {});
    expect(doc).toContain('ccg-page-link');
    expect(doc).not.toContain('img-src');
    expect(doc).not.toContain('ccg-page-storage');
  });

  it('for a remote file blocks other sites\' pictures and gives storage, without the link question', () => {
    const doc = frameDocument(PAGE, 'remote', { k: 'v' });
    expect(doc).toContain('img-src data: blob:');
    expect(doc).toContain('ccg-page-storage');
    expect(doc).not.toContain('ccg-page-link');
  });

  it('always reports the page\'s colour', () => {
    expect(frameDocument(PAGE, 'local', {})).toContain('ccg-page-background');
    expect(frameDocument(PAGE, 'remote', {})).toContain('ccg-page-background');
  });
});

describe('served pages', () => {
  it('hands the served page the pane\'s scripts and a report of its address', async () => {
    const { servedInjection } = await import('../pageFrame');
    const inject = servedInjection();
    expect(inject).toContain('ccg-page-link');
    expect(inject).toContain('ccg-page-select');
    expect(inject).toContain('ccg-page-background');
    expect(inject).toContain('ccg-page-location');
    expect(inject).not.toContain('</head>');
  });

  it('turns a served address back into the file', async () => {
    const { fileOfServedPath } = await import('../pageFrame');
    const token = 'a'.repeat(48);
    expect(fileOfServedPath('/work/demo', `/p/${token}/pages/a%20b.html`)).toBe('/work/demo/pages/a b.html');
    expect(fileOfServedPath('C:\\work\\demo', `/p/${token}/pages/a.html`)).toBe('C:\\work\\demo\\pages\\a.html');
    expect(fileOfServedPath('/work', '/other/x.html')).toBeUndefined();
  });
});
