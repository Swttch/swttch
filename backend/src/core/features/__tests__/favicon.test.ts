import { describe, expect, it } from 'vitest';
import { blocksFraming, iconLinksOf } from '../favicon';

describe('iconLinksOf', () => {
  it('lists the icons a page names, the shortcut icon first, resolved against the page', () => {
    const html = '<head><link rel="apple-touch-icon" href="/a.png"><link rel="shortcut icon" href="img/f.ico"><link rel="stylesheet" href="x.css"></head>';
    expect(iconLinksOf(html, 'https://www.example.com/sub/')).toEqual(['https://www.example.com/sub/img/f.ico', 'https://www.example.com/a.png']);
  });

  it('finds nothing in a page without icons', () => {
    expect(iconLinksOf('<head><title>x</title></head>', 'https://example.com')).toEqual([]);
  });
});

describe('blocksFraming', () => {
  const headers = (h: Record<string, string>) => ({ get: (name: string) => h[name.toLowerCase()] ?? null });

  it('is true for a page that denies frames', () => {
    expect(blocksFraming(headers({ 'x-frame-options': 'DENY' }))).toBe(true);
    expect(blocksFraming(headers({ 'x-frame-options': 'SAMEORIGIN' }))).toBe(true);
    expect(blocksFraming(headers({ 'content-security-policy': "default-src 'self'; frame-ancestors 'self'" }))).toBe(true);
  });

  it('is false for a page that allows them, and frame-ancestors wins over the older header', () => {
    expect(blocksFraming(headers({}))).toBe(false);
    expect(blocksFraming(headers({ 'content-security-policy': 'frame-ancestors *', 'x-frame-options': 'DENY' }))).toBe(false);
  });
});
