import { describe, it, expect } from 'vitest';
import { readProxySummary, maskProxyUrl } from '../proxy-summary';

describe('maskProxyUrl', () => {
  it('hides the password and keeps the username', () => {
    // The username is what lets someone recognize which proxy this is; the password
    // is headed for a panel that gets screenshotted into bug reports.
    expect(maskProxyUrl('http://alice:s3cret@proxy.corp:3128')).toBe('http://alice:***@proxy.corp:3128');
  });

  it('leaves a credential-free URL alone', () => {
    expect(maskProxyUrl('http://proxy.corp:3128')).toBe('http://proxy.corp:3128');
  });

  it('drops the credentials of a URL it cannot parse rather than risking a leak', () => {
    expect(maskProxyUrl('not a url://alice:s3cret@proxy.corp:3128')).toBe('proxy.corp:3128');
  });

  it('returns an unparseable value without an authority unchanged', () => {
    expect(maskProxyUrl('nonsense')).toBe('nonsense');
  });

  it('never returns the password for any shape it handles', () => {
    for (const raw of [
      'http://alice:s3cret@proxy.corp:3128',
      'https://bob:s3cret@10.0.0.1:8080',
      'socks5://carol:s3cret@127.0.0.1:1080',
      'garbage://dave:s3cret@host',
    ]) {
      expect(maskProxyUrl(raw)).not.toContain('s3cret');
    }
  });
});

describe('readProxySummary', () => {
  it('reports nothing when the request goes out directly', () => {
    expect(readProxySummary({})).toBeNull();
  });

  it('names the variable that supplied the value', () => {
    expect(readProxySummary({ HTTPS_PROXY: 'http://proxy.corp:3128' })).toEqual({
      variable: 'HTTPS_PROXY',
      url: 'http://proxy.corp:3128',
    });
  });

  it('prefers the https form, because every Anthropic endpoint is https', () => {
    const summary = readProxySummary({
      HTTP_PROXY: 'http://plain.corp:3128',
      HTTPS_PROXY: 'http://secure.corp:3128',
    });
    expect(summary?.variable).toBe('HTTPS_PROXY');
  });

  it('falls back to ALL_PROXY before the http-only forms', () => {
    const summary = readProxySummary({
      HTTP_PROXY: 'http://plain.corp:3128',
      ALL_PROXY: 'socks5://socks.corp:1080',
    });
    expect(summary?.variable).toBe('ALL_PROXY');
  });

  it('ignores a variable set to an empty or blank string', () => {
    // An exported-but-empty proxy variable means "no proxy", not "a proxy at ''".
    expect(readProxySummary({ HTTPS_PROXY: '   ', HTTP_PROXY: '' })).toBeNull();
  });

  it('masks the password of whatever it reports', () => {
    const summary = readProxySummary({ HTTPS_PROXY: 'http://alice:s3cret@proxy.corp:3128' });
    expect(summary?.url).not.toContain('s3cret');
  });
});
