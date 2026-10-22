import { describe, it, expect } from 'vitest';
import {
  normalizeMarkdownLinkUrls,
  parseMarkdownFileLink,
  normalizeDotSegments,
  resolveMarkdownFileLink,
  toLocalFileHref,
} from '../markdownFileLink';

describe('parseMarkdownFileLink', () => {
  it('parses a POSIX-absolute path with a line', () => {
    expect(parseMarkdownFileLink('/abs/f.ts#L42')).toEqual({ path: '/abs/f.ts', line: 42 });
  });

  it('parses a POSIX-absolute path without a line (undefined line → open at top)', () => {
    expect(parseMarkdownFileLink('/abs/f.ts')).toEqual({ path: '/abs/f.ts', line: undefined });
  });

  it('takes the range start line from #L10-L25', () => {
    expect(parseMarkdownFileLink('/abs/f.ts#L10-L25')).toEqual({ path: '/abs/f.ts', line: 10 });
  });

  it('parses a #L10C5 column anchor', () => {
    expect(parseMarkdownFileLink('/abs/f.ts#L10C5')).toEqual({ path: '/abs/f.ts', line: 10, column: 5 });
  });

  it('takes the start line and column from a #L10C5-L20C15 range', () => {
    expect(parseMarkdownFileLink('/abs/f.ts#L10C5-L20C15')).toEqual({ path: '/abs/f.ts', line: 10, column: 5 });
  });

  it('strips a leading ./ from a relative path', () => {
    expect(parseMarkdownFileLink('./src/f.ts#L5')).toEqual({ path: 'src/f.ts', line: 5 });
  });

  it('keeps a ../ relative path', () => {
    expect(parseMarkdownFileLink('../f.ts')).toEqual({ path: '../f.ts', line: undefined });
  });

  it('treats a Windows drive-rooted path as local (forward slashes)', () => {
    expect(parseMarkdownFileLink('C:/proj/f.ts#L42')).toEqual({ path: 'C:/proj/f.ts', line: 42 });
  });

  it('treats a Windows drive-rooted path as local (backslashes)', () => {
    expect(parseMarkdownFileLink('C:\\proj\\f.ts')).toEqual({ path: 'C:\\proj\\f.ts', line: undefined });
  });

  it('restores a slash-prefixed Windows drive href (/C:/… → C:/…)', () => {
    expect(parseMarkdownFileLink('/C:/proj/f.ts#L4')).toEqual({ path: 'C:/proj/f.ts', line: 4 });
  });

  it('percent-decodes the path', () => {
    expect(parseMarkdownFileLink('/abs/my%20file.ts#L3')).toEqual({ path: '/abs/my file.ts', line: 3 });
  });

  it('returns null for http(s) and mailto URLs', () => {
    expect(parseMarkdownFileLink('https://example.com/x')).toBeNull();
    expect(parseMarkdownFileLink('http://example.com')).toBeNull();
    expect(parseMarkdownFileLink('mailto:a@b.com')).toBeNull();
  });

  it('returns null for a protocol-relative //host URL', () => {
    expect(parseMarkdownFileLink('//example.com/x')).toBeNull();
  });

  it('returns null for a bare #fragment', () => {
    expect(parseMarkdownFileLink('#section')).toBeNull();
  });

  it('returns null for a bare relative path (chat markdown always prefixes ./)', () => {
    expect(parseMarkdownFileLink('src/f.ts')).toBeNull();
  });

  it('returns null for empty / non-string input', () => {
    expect(parseMarkdownFileLink('')).toBeNull();
    // @ts-expect-error runtime guard against a non-string href
    expect(parseMarkdownFileLink(null)).toBeNull();
  });
});

describe('normalizeDotSegments', () => {
  it('collapses .. against a POSIX root', () => {
    expect(normalizeDotSegments('/wd/../f.ts')).toBe('/f.ts');
  });

  it('drops . segments', () => {
    expect(normalizeDotSegments('/a/b/./c')).toBe('/a/b/c');
  });

  it('collapses .. against a Windows drive root and normalizes separators', () => {
    expect(normalizeDotSegments('C:/wd/../f.ts')).toBe('C:/f.ts');
    expect(normalizeDotSegments('C:\\wd\\..\\f.ts')).toBe('C:/f.ts');
  });

  it('keeps a leading .. for a relative path (nothing above to pop)', () => {
    expect(normalizeDotSegments('../f.ts')).toBe('../f.ts');
    expect(normalizeDotSegments('a/b/../c')).toBe('a/c');
  });

  it('never escapes above the root', () => {
    expect(normalizeDotSegments('/a/../../b')).toBe('/b');
  });
});

describe('toLocalFileHref', () => {
  it('leaves a POSIX-absolute path unchanged', () => {
    expect(toLocalFileHref('/abs/f.ts')).toBe('/abs/f.ts');
  });

  it('prefixes a Windows drive path with / and forward-slashes it', () => {
    expect(toLocalFileHref('C:/proj/f.ts')).toBe('/C:/proj/f.ts');
    expect(toLocalFileHref('C:\\proj\\f.ts')).toBe('/C:/proj/f.ts');
  });

  it('collapses . / .. segments', () => {
    expect(toLocalFileHref('/wd/../a/./b.ts')).toBe('/a/b.ts');
  });
});

describe('resolveMarkdownFileLink', () => {
  it('leaves an absolute path unchanged (working dir irrelevant)', () => {
    expect(resolveMarkdownFileLink('/abs/f.ts#L5', '/wd')).toEqual({ path: '/abs/f.ts', line: 5 });
  });

  it('carries a line and column through resolution', () => {
    expect(resolveMarkdownFileLink('./src/f.ts#L3C8', '/wd')).toEqual({ path: '/wd/src/f.ts', line: 3, column: 8 });
  });

  it('joins a ./ relative path against the working dir', () => {
    expect(resolveMarkdownFileLink('./src/f.ts#L3', '/wd')).toEqual({ path: '/wd/src/f.ts', line: 3 });
  });

  it('joins and normalizes a ../ relative path', () => {
    expect(resolveMarkdownFileLink('../f.ts', '/wd/sub')).toEqual({ path: '/wd/f.ts', line: undefined });
  });

  it('returns the relative path as-is when the working dir is unknown', () => {
    expect(resolveMarkdownFileLink('./src/f.ts#L3', null)).toEqual({ path: 'src/f.ts', line: 3 });
  });

  it('returns null for an external link', () => {
    expect(resolveMarkdownFileLink('https://example.com', '/wd')).toBeNull();
  });
});

// A WSL project folder reaches the webview as a Windows UNC path. Resolving a
// relative link against it used to drop the `\\wsl$\Ubuntu` root, so the backend was
// asked for `/wsl$/Ubuntu/…` and answered "not found" (issue #567).
describe('Windows UNC paths (WSL project folders)', () => {
  const wslDir = '\\\\wsl$\\Ubuntu\\home\\me\\proj';

  it('keeps the \\host\share root when normalizing', () => {
    expect(normalizeDotSegments('\\\\wsl$\\Ubuntu\\home\\me\\x.png')).toBe('//wsl$/Ubuntu/home/me/x.png');
    expect(normalizeDotSegments('//wsl.localhost/Ubuntu/home/me/x.png')).toBe('//wsl.localhost/Ubuntu/home/me/x.png');
  });

  it('never lets .. climb above the share', () => {
    expect(normalizeDotSegments('\\\\wsl$\\Ubuntu\\..\\..\\x.png')).toBe('//wsl$/Ubuntu/x.png');
  });

  it('carries a UNC path through a link href and back', () => {
    const href = toLocalFileHref('\\\\wsl$\\Ubuntu\\home\\me\\x.png');
    expect(href.startsWith('//')).toBe(false); // must not read as a protocol-relative URL
    expect(parseMarkdownFileLink(href)).toEqual({ path: '//wsl$/Ubuntu/home/me/x.png', line: undefined });
  });

  it('resolves a relative link against a UNC working directory', () => {
    expect(resolveMarkdownFileLink('tmp/levelcmp/x.png', wslDir)).toBeNull(); // not a ./ link: handled by the preprocessor
    const markdown = normalizeMarkdownLinkUrls('[x](tmp/levelcmp/x.png)', wslDir);
    const href = /\]\((.*)\)/.exec(markdown)![1];
    expect(parseMarkdownFileLink(href)).toEqual({
      path: '//wsl$/Ubuntu/home/me/proj/tmp/levelcmp/x.png',
      line: undefined,
    });
  });

  it('treats a backslash UNC link as a local file, not as a relative path', () => {
    const markdown = normalizeMarkdownLinkUrls('[x](\\\\wsl$\\Ubuntu\\home\\me\\proj\\x.png)', '/ignored');
    const href = /\]\((.*)\)/.exec(markdown)![1];
    expect(parseMarkdownFileLink(href)?.path).toBe('//wsl$/Ubuntu/home/me/proj/x.png');
  });

  it('still treats a protocol-relative URL as external', () => {
    expect(parseMarkdownFileLink('//example.com/x.png')).toBeNull();
    expect(normalizeMarkdownLinkUrls('[x](//example.com/x.png)', '/wd')).toBe('[x](//example.com/x.png)');
  });
});
