import { describe, it, expect } from 'vitest';
import { withImagePolicy } from '../pagePolicy';

describe('withImagePolicy', () => {
  it('puts the policy first inside <head>, after the doctype', () => {
    const framed = withImagePolicy('<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="x.css"></head></html>');
    expect(framed.startsWith('<!doctype html>')).toBe(true);
    expect(framed.indexOf('Content-Security-Policy')).toBeLessThan(framed.indexOf('<meta charset'));
  });

  it('allows nothing but the page\'s own inline pictures, and says nothing about scripts or styles', () => {
    const policy = /content="([^"]*)"/.exec(withImagePolicy('<head></head>'))![1];
    expect(policy).toBe('img-src data: blob:');
  });

  it('finds a place without a head, without an html tag, and without a doctype', () => {
    expect(withImagePolicy('<html><body>x</body></html>').indexOf('<meta')).toBe('<html>'.length);
    expect(withImagePolicy('<!DOCTYPE html><p>x</p>').indexOf('<meta')).toBe('<!DOCTYPE html>'.length);
    expect(withImagePolicy('<p>x</p>').startsWith('<meta')).toBe(true);
  });
});
