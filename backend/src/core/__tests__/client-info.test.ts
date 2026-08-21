import { describe, it, expect } from 'vitest';
import { formatBrowserFromUserAgent, formatClientInfo } from '../client-info';

const UA = {
  chromeMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.7827.55 Safari/537.36',
  safariMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15',
  firefoxLinux: 'Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0',
  edgeWin: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.2903.86',
};

/** The exact shape Kotlin composes in NodeProcessManager.kt. */
const IDE_STRING = 'IntelliJ IDEA 2024.1.4 (IC-241.15989.149)';

describe('formatBrowserFromUserAgent', () => {
  it('reduces a user agent to name + version', () => {
    expect(formatBrowserFromUserAgent(UA.chromeMac)).toBe('Chrome 149.0.7827.55');
    expect(formatBrowserFromUserAgent(UA.firefoxLinux)).toBe('Firefox 133.0');
  });

  it('does not mistake Edge for Chrome', () => {
    // Edge's UA contains "Chrome/131.0.0.0"; the Edg/ token is what identifies it.
    expect(formatBrowserFromUserAgent(UA.edgeWin)).toBe('Microsoft Edge 131.0.2903.86');
  });

  it('identifies Safari, whose UA contains no Chrome token', () => {
    expect(formatBrowserFromUserAgent(UA.safariMac)).toBe('Safari 18.2');
  });

  it('returns null for empty or blank input', () => {
    expect(formatBrowserFromUserAgent('')).toBeNull();
    expect(formatBrowserFromUserAgent('   ')).toBeNull();
  });

  it('returns null rather than a half-parsed name for an unidentifiable agent', () => {
    expect(formatBrowserFromUserAgent('not-a-user-agent')).toBeNull();
  });

  it('never leaks the frozen macOS version from the user agent', () => {
    // Apple pins macOS at 10_15_7 in the UA; the OS line must not come from here.
    for (const ua of Object.values(UA)) {
      expect(formatBrowserFromUserAgent(ua)).not.toContain('10.15.7');
    }
  });
});

describe('formatClientInfo', () => {
  it('passes the IDE product string through untouched, build included', () => {
    expect(formatClientInfo(IDE_STRING, true)).toBe(IDE_STRING);
  });

  it('does not run the IDE string through the UA parser', () => {
    // Guards the mode mix-up: parsing this as a UA would mangle it.
    const result = formatClientInfo(IDE_STRING, true);
    expect(result).toContain('IC-241.15989.149');
  });

  it('condenses a user agent in standalone mode', () => {
    expect(formatClientInfo(UA.chromeMac, false)).toBe('Chrome 149.0.7827.55');
  });

  it('falls back to the raw value when the agent cannot be identified', () => {
    expect(formatClientInfo('some-embedded-webview/1.0', false)).toBe('some-embedded-webview/1.0');
  });

  it('returns null when nothing is known', () => {
    expect(formatClientInfo('', false)).toBeNull();
    expect(formatClientInfo('   ', true)).toBeNull();
  });
});
