import { describe, it, expect } from 'vitest';
import { parseLatestReleaseNotes } from '../parseReleaseNotes';

/**
 * Verbatim `notes` of update 0.30.1 as served by
 * `plugins.jetbrains.com/api/plugins/30313/updates` (captured 2026-09-07).
 * It carries two releases concatenated, which is exactly the tail this parser
 * has to cut.
 */
const MARKETPLACE_NOTES_0_30_1 =
  '<h3>0.30.1 - Add conversation fork, rewind, and account pools</h3>\n' +
  '<ul>\n' +
  '    <li>Add account pools (#410)</li>\n' +
  '    <li>Add conversation fork and rewind from a message (#407, reported by @M1s4k1)</li>\n' +
  '    <li>Improve session dropdown loading speed (#408)</li>\n' +
  '    <li>Improve the message shown when voice input is unavailable (#411, reported by @deniskrizanovic)</li>\n' +
  '</ul>\n' +
  '<h3>0.30.0 - Tool cards for every built-in tool, and a Windows IME fix</h3>\n' +
  '<ul>\n' +
  '    <li>Add dedicated card renderers for the built-in tools and legacy aliases that used to fall back to "unknown" (#402)</li>\n' +
  '    <li>Fix the composer becoming unresponsive after a Hangul IME composition ends without a compositionend event on Windows (#405, reported by @ygkim-vway)</li>\n' +
  '</ul>';

describe('parseLatestReleaseNotes', () => {
  it('keeps only the newest section and cuts the older releases trailing it', () => {
    const { title, items } = parseLatestReleaseNotes(MARKETPLACE_NOTES_0_30_1, '0.30.1');

    expect(title).toBe('Add conversation fork, rewind, and account pools');
    expect(items).toEqual([
      'Add account pools (#410)',
      'Add conversation fork and rewind from a message (#407, reported by @M1s4k1)',
      'Improve session dropdown loading speed (#408)',
      'Improve the message shown when voice input is unavailable (#411, reported by @deniskrizanovic)',
    ]);
    // The 0.30.0 tail must not leak in.
    expect(items.join(' ')).not.toContain('#402');
    expect(items.join(' ')).not.toContain('#405');
  });

  it('renders every item of the newest section, not just the heading', () => {
    const { items } = parseLatestReleaseNotes(MARKETPLACE_NOTES_0_30_1, '0.30.1');
    expect(items).toHaveLength(4);
  });

  it('strips the "<version> - " prefix from the heading', () => {
    const notes = '<h3>1.2.3 - Ship it</h3><ul><li>a</li></ul>';
    expect(parseLatestReleaseNotes(notes, '1.2.3').title).toBe('Ship it');
  });

  it('leaves the heading untouched when it does not carry the version prefix', () => {
    const notes = '<h3>Ship it</h3><ul><li>a</li></ul>';
    expect(parseLatestReleaseNotes(notes, '1.2.3').title).toBe('Ship it');
  });

  it('decodes HTML entities and drops inline markup inside an item', () => {
    const notes =
      '<h3>1.0.0 - Title</h3><ul><li>Renders <code>&quot;unknown&quot;</code> &amp; friends</li></ul>';
    expect(parseLatestReleaseNotes(notes, '1.0.0').items).toEqual([
      'Renders "unknown" & friends',
    ]);
  });

  it('collapses the whitespace an indented changelog puts inside an item', () => {
    const notes = '<h3>1.0.0 - Title</h3><ul>\n  <li>\n    wrapped\n    text\n  </li>\n</ul>';
    expect(parseLatestReleaseNotes(notes, '1.0.0').items).toEqual(['wrapped text']);
  });

  it('reads an ordered list too', () => {
    const notes = '<h3>1.0.0 - Title</h3><ol><li>first</li><li>second</li></ol>';
    expect(parseLatestReleaseNotes(notes, '1.0.0').items).toEqual(['first', 'second']);
  });

  it('returns an empty section for missing, empty, or heading-less notes', () => {
    expect(parseLatestReleaseNotes(null, '1.0.0')).toEqual({ title: '', items: [] });
    expect(parseLatestReleaseNotes('', '1.0.0')).toEqual({ title: '', items: [] });
    expect(parseLatestReleaseNotes('<ul><li>orphan</li></ul>', '1.0.0')).toEqual({
      title: '',
      items: [],
    });
  });

  it('returns the title with no items when the section has no list', () => {
    expect(parseLatestReleaseNotes('<h3>1.0.0 - Title</h3>', '1.0.0')).toEqual({
      title: 'Title',
      items: [],
    });
  });
});
