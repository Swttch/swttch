import { describe, expect, it } from 'vitest';
import { browserNameOf, readDefaultBrowser } from '../defaultBrowser';

describe('defaultBrowser', () => {
  it('names the browsers by the ids the systems use', () => {
    expect(browserNameOf('com.google.chrome')).toBe('Google Chrome');
    expect(browserNameOf('ChromeHTML')).toBe('Google Chrome');
    expect(browserNameOf('MSEdgeHTM')).toBe('Microsoft Edge');
    expect(browserNameOf('FirefoxURL-308046B0AF4A39CB')).toBe('Firefox');
    expect(browserNameOf('com.apple.Safari')).toBe('Safari');
    expect(browserNameOf('org.example.unknown')).toBe('org.example.unknown');
  });

  it.runIf(process.platform === 'darwin')('reads this Mac\'s default browser', async () => {
    const name = await readDefaultBrowser();
    console.log('default browser:', name);
    expect(typeof name).toBe('string');
  });
});
