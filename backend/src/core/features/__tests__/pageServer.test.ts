import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { request } from 'http';
import { tmpdir } from 'os';
import { join } from 'path';
import { injectIntoHtml, resolveServedFile, servePage, stopPageServer } from '../pageServer';

let dir: string;
let outside: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'ccg-page-'));
  outside = mkdtempSync(join(tmpdir(), 'ccg-out-'));
  mkdirSync(join(dir, 'assets'));
  writeFileSync(join(dir, 'index.html'), '<!doctype html><html><head><title>t</title></head><body><img src="assets/a.css"></body></html>');
  writeFileSync(join(dir, 'assets', 'a.css'), 'body{color:red}');
  writeFileSync(join(dir, '.env'), 'SECRET=1');
  writeFileSync(join(outside, 'secret.txt'), 'nope');
  symlinkSync(outside, join(dir, 'link'));
});

afterAll(() => {
  stopPageServer();
  rmSync(dir, { recursive: true, force: true });
  rmSync(outside, { recursive: true, force: true });
});

describe('resolveServedFile', () => {
  it('serves files under the root and nothing else', () => {
    expect(resolveServedFile(dir, '/assets/a.css')).toBe(join(dir, 'assets', 'a.css'));
    expect(resolveServedFile(dir, '/../etc/passwd')).toBeUndefined();
    expect(resolveServedFile(dir, '/%2e%2e/x')).toBeUndefined();
    expect(resolveServedFile(dir, '/.env')).toBeUndefined();
    expect(resolveServedFile(dir, '/link/secret.txt')).toBeUndefined();
  });
});

describe('injectIntoHtml', () => {
  it('puts the markup right after <head>, or at the start without one', () => {
    expect(injectIntoHtml('<html><head><title>x</title></head></html>', '<i/>')).toBe('<html><head><i/><title>x</title></head></html>');
    expect(injectIntoHtml('hi', '<i/>')).toBe('<i/>hi');
  });
});

describe('the served page', () => {
  it('answers with the page and its injection, its neighbours, and refuses the rest', async () => {
    const page = await servePage(join(dir, 'index.html'), undefined, '<script>window.x=1</script>');
    const base = `http://127.0.0.1:${page.port}`;
    const html = await (await fetch(base + page.pathname)).text();
    expect(html).toContain('<head><script>window.x=1</script>');
    const css = await fetch(base + page.pathname.replace('index.html', 'assets/a.css'));
    expect(css.headers.get('content-type')).toContain('text/css');
    expect(await css.text()).toBe('body{color:red}');
    expect((await fetch(base + page.pathname.replace('index.html', '.env'))).status).toBe(404);
    expect((await fetch(`${base}/p/${'0'.repeat(48)}/index.html`)).status).toBe(404);
    expect((await fetch(base + '/')).status).toBe(404);
    const rebound = await new Promise<number>((done) => {
      request({ host: '127.0.0.1', port: page.port, path: page.pathname, headers: { Host: 'evil.example' } }, (res) => {
        res.resume();
        done(res.statusCode ?? 0);
      }).end();
    });
    expect(rebound).toBe(403);
  });
});
