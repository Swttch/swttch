import { describe, it, expect } from 'vitest';
import {
  stripToTextWithBreaks,
  sanitizeReleaseHtml,
  takeFirstSection,
  stripVersionPrefix,
} from '../releaseNotesHtml';

// Fallback used when DOMParser is unavailable/failing (some JCEF builds). The
// old behavior stripped every tag and collapsed the changelog into one run-on
// paragraph; these tests pin the line-structure-preserving replacement.
describe('stripToTextWithBreaks', () => {
  it('turns block boundaries into <br> and list items into bullets, dropping tags', () => {
    const html =
      '<h3>0.25.2 - Title</h3>\n<ul>\n<li>First item</li>\n<li>Second item</li>\n</ul>';
    const out = stripToTextWithBreaks(html);

    expect(out).not.toMatch(/<h3|<ul|<li/); // tags gone
    expect(out).toContain('0.25.2 - Title'); // heading text kept
    expect(out).toContain('• First item');
    expect(out).toContain('• Second item');
    expect(out).toContain('<br>'); // line structure preserved
    expect((out.match(/<br>/g) ?? []).length).toBeGreaterThanOrEqual(2); // not one run-on line
  });

  it('does not let raw markup execute (tags stripped, text escaped)', () => {
    const out = stripToTextWithBreaks('<p>hello <script>alert(1)</script> world</p>');
    expect(out).not.toContain('<script>');
    expect(out).toContain('hello');
    expect(out).toContain('world');
  });

  it('collapses runs of blank lines', () => {
    const out = stripToTextWithBreaks('<p>a</p><p></p><p></p><p></p><p>b</p>');
    expect(out).not.toMatch(/(<br>){3,}/);
  });
});

// The walk used to be handed `doc.body` itself. `body` is not in the allowlist,
// so the walk unwrapped and removed it, `doc.body.innerHTML` then threw, and
// every release note silently rendered through the plain-text fallback — lists,
// links and code spans all flattened to "• " lines.
describe('sanitizeReleaseHtml', () => {
  it('keeps allowed markup instead of falling back to plain text', () => {
    const out = sanitizeReleaseHtml('<ul><li>First</li><li>Second</li></ul>');

    expect(out).toContain('<ul>');
    expect(out).toContain('<li>First</li>');
    expect(out).not.toContain('•'); // the fallback's bullet marker
  });

  it('keeps links, code spans and emphasis', () => {
    const out = sanitizeReleaseHtml(
      '<p>see <a href="https://example.com">docs</a> and <code>--flag</code> <strong>now</strong></p>',
    );

    expect(out).toContain('<a href="https://example.com">docs</a>');
    expect(out).toContain('<code>--flag</code>');
    expect(out).toContain('<strong>now</strong>');
  });

  it('drops disallowed tags while keeping their text', () => {
    const out = sanitizeReleaseHtml('<p>safe</p><script>window.pwned = 1</script>');

    expect(out).not.toContain('<script');
    expect(out).toContain('<p>safe</p>');
  });

  it('drops event handlers and javascript: urls', () => {
    const out = sanitizeReleaseHtml(
      '<a href="javascript:alert(1)" onclick="alert(2)">x</a>',
    );

    expect(out).not.toContain('javascript:');
    expect(out).not.toContain('onclick');
  });
});

// A marketplace `notes` field carries every older release after the newest one.
// A pager that shows one release per page has to cut at the section boundary,
// or page 1 repeats the entire history and page 2 repeats all but one entry.
const CONCATENATED = [
  '<h3>0.30.2 - Newest</h3>',
  '<ul><li>Third item</li></ul>',
  '<h3>0.30.1 - Middle</h3>',
  '<ul><li>Second item</li></ul>',
  '<h3>0.30.0 - Oldest</h3>',
  '<ul><li>First item</li></ul>',
].join('\n');

describe('takeFirstSection', () => {
  it('keeps only the newest section, dropping the older releases behind it', () => {
    const out = takeFirstSection(CONCATENATED);

    expect(out).toContain('Third item');
    expect(out).not.toContain('Second item');
    expect(out).not.toContain('First item');
    expect(out).not.toContain('0.30.1');
  });

  it('keeps the markup of that section rather than flattening it', () => {
    const out = takeFirstSection(
      '<h3>0.1.0 - T</h3><ul><li>see <code>--flag</code></li></ul>',
    );

    expect(out).toContain('<ul>');
    expect(out).toContain('<code>--flag</code>');
  });

  it('returns an unsectioned note whole', () => {
    const out = takeFirstSection('<p>no headings here</p>');
    expect(out).toContain('no headings here');
  });

  it('returns nothing when the newest section has no body', () => {
    expect(takeFirstSection('<h3>0.1.0 - T</h3><h3>0.0.9 - U</h3><ul><li>x</li></ul>')).toBe('');
  });
});

describe('stripVersionPrefix', () => {
  it('drops the version the header already shows', () => {
    expect(stripVersionPrefix('0.30.2 - Asset viewer', '0.30.2')).toBe('Asset viewer');
  });

  it('leaves a title that does not carry the prefix', () => {
    expect(stripVersionPrefix('Asset viewer', '0.30.2')).toBe('Asset viewer');
    expect(stripVersionPrefix('0.30.2 - Asset viewer', null)).toBe('0.30.2 - Asset viewer');
  });
});
