import { describe, it, expect } from 'vitest';
import { linkifyPlainTextFileRefs } from '../plainTextFileRefs';

describe('linkifyPlainTextFileRefs', () => {
  it('linkifies a slash path with a :line', () => {
    expect(linkifyPlainTextFileRefs('see src/app.ts:42 here')).toBe(
      'see [src/app.ts:42](src/app.ts#L42) here',
    );
  });

  it('carries the column from a :line:col', () => {
    expect(linkifyPlainTextFileRefs('at src/app.ts:42:7.')).toBe(
      'at [src/app.ts:42:7](src/app.ts#L42C7).',
    );
  });

  it('linkifies a #L range and keeps the display text, anchoring the start line', () => {
    expect(linkifyPlainTextFileRefs('in src/example/File.java#L10-L25 look')).toBe(
      'in [src/example/File.java#L10-L25](src/example/File.java#L10) look',
    );
  });

  it('carries a #LxxCyy column anchor', () => {
    expect(linkifyPlainTextFileRefs('src/a.ts#L3C9')).toBe('[src/a.ts#L3C9](src/a.ts#L3C9)');
  });

  it('keeps a POSIX-absolute path absolute', () => {
    expect(linkifyPlainTextFileRefs('/abs/foo.ts:5')).toBe('[/abs/foo.ts:5](/abs/foo.ts#L5)');
  });

  it('keeps a ./ or ../ lead', () => {
    expect(linkifyPlainTextFileRefs('./foo.ts:2')).toBe('[./foo.ts:2](./foo.ts#L2)');
    expect(linkifyPlainTextFileRefs('../lib/foo.ts:2')).toBe('[../lib/foo.ts:2](../lib/foo.ts#L2)');
  });

  it('does NOT linkify a bare filename with no slash (ambiguous with prose)', () => {
    expect(linkifyPlainTextFileRefs('App.java:120 failed')).toBe('App.java:120 failed');
  });

  it('does NOT linkify a host:port that looks like name.ext (no slash)', () => {
    expect(linkifyPlainTextFileRefs('reach example.com:8080 now')).toBe('reach example.com:8080 now');
  });

  it('linkifies a path with no line locator, which opens at the top of the file', () => {
    expect(linkifyPlainTextFileRefs('open src/app.ts please')).toBe('open [src/app.ts](src/app.ts) please');
    expect(linkifyPlainTextFileRefs('Published /private/tmp/demo/page.html at')).toBe(
      'Published [/private/tmp/demo/page.html](/private/tmp/demo/page.html) at',
    );
  });

  it('does not take a sentence full stop, a version or a fraction for part of a path', () => {
    expect(linkifyPlainTextFileRefs('see src/app.ts.')).toBe('see [src/app.ts](src/app.ts).');
    expect(linkifyPlainTextFileRefs('about 1/2.5 of it')).toBe('about 1/2.5 of it');
  });

  it('does NOT linkify a bare time like 10:30', () => {
    expect(linkifyPlainTextFileRefs('meet at 10:30 today')).toBe('meet at 10:30 today');
  });

  it('turns an inline code span that is only a path into a link, and leaves other code alone', () => {
    expect(linkifyPlainTextFileRefs('use `src/app.ts:42` here')).toBe('use [src/app.ts:42](src/app.ts#L42) here');
    expect(linkifyPlainTextFileRefs('use `demo/page.html` here')).toBe('use [demo/page.html](demo/page.html) here');
    expect(linkifyPlainTextFileRefs('run `cat src/app.ts` now')).toBe('run `cat src/app.ts` now');
    expect(linkifyPlainTextFileRefs('a `page.html` b')).toBe('a `page.html` b');
  });

  it('leaves a ref inside a fenced block untouched', () => {
    const md = '```\nsrc/app.ts:42\n```';
    expect(linkifyPlainTextFileRefs(md)).toBe(md);
  });

  it('does not linkify inside an existing markdown link text', () => {
    const md = '[src/app.ts:42](./src/app.ts#L42)';
    expect(linkifyPlainTextFileRefs(md)).toBe(md);
  });

  it('does not touch a ref inside a http(s) URL with a :port', () => {
    const md = 'https://ex.com:8080/a/b.js:10';
    expect(linkifyPlainTextFileRefs(md)).toBe(md);
  });

  it('does not linkify an image alt/url', () => {
    const md = '![src/app.ts:1](./img/x.png)';
    expect(linkifyPlainTextFileRefs(md)).toBe(md);
  });

  it('linkifies multiple refs in one line', () => {
    expect(linkifyPlainTextFileRefs('a/x.ts:1 and b/y.ts:2')).toBe(
      '[a/x.ts:1](a/x.ts#L1) and [b/y.ts:2](b/y.ts#L2)',
    );
  });
});
