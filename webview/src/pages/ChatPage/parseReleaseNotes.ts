/**
 * Parses the newest section out of a JetBrains Marketplace changelog.
 *
 * `notes` (from `GET_PLUGIN_UPDATES`, relayed verbatim from
 * `plugins.jetbrains.com/api/plugins/30313/updates`) is an HTML changelog that
 * carries SEVERAL releases concatenated, newest first:
 *
 *   <h3>0.30.1 - Add conversation fork, rewind, and account pools</h3>
 *   <ul><li>Add account pools (#410)</li> ...</ul>
 *   <h3>0.30.0 - Tool cards for every built-in tool, and a Windows IME fix</h3>
 *   <ul>...</ul>
 *
 * Only the first section describes the update being offered; everything from
 * the second heading on is the tail of older releases the user has already
 * seen, so it is cut here rather than rendered.
 *
 * Parsing goes through `DOMParser` instead of a regex so that HTML entities
 * (`&quot;`, `&amp;`, …) are decoded and markup inside a list item is reduced
 * to its text. The result is plain strings the banner renders as React text
 * nodes, which means no `dangerouslySetInnerHTML` and therefore no way for
 * remote changelog markup to inject nodes into the webview.
 */

/** Heading levels that start a release section in the marketplace changelog. */
const HEADING_TAGS = new Set(['H1', 'H2', 'H3']);

export interface ReleaseNotesSection {
  /**
   * Heading text with the leading `"<version> - "` prefix stripped (the
   * banner already shows the version separately). Empty when the changelog
   * has no heading.
   */
  title: string;
  /** List items of the newest section only, in document order. */
  items: string[];
}

const EMPTY: ReleaseNotesSection = { title: '', items: [] };

export function parseLatestReleaseNotes(
  notes: string | null | undefined,
  latestVersion: string | null,
): ReleaseNotesSection {
  if (!notes) return EMPTY;

  const doc = new DOMParser().parseFromString(notes, 'text/html');
  const blocks = Array.from(doc.body.children);

  const headingIndex = blocks.findIndex((el) => HEADING_TAGS.has(el.tagName));
  if (headingIndex === -1) return EMPTY;

  let title = blocks[headingIndex].textContent?.trim() ?? '';
  if (latestVersion && title.startsWith(`${latestVersion} - `)) {
    title = title.slice(`${latestVersion} - `.length);
  }

  const items: string[] = [];
  for (let i = headingIndex + 1; i < blocks.length; i++) {
    // A second heading starts the previous release: that is the tail to cut.
    if (HEADING_TAGS.has(blocks[i].tagName)) break;
    for (const li of blocks[i].querySelectorAll(':scope > li')) {
      const text = li.textContent?.replace(/\s+/g, ' ').trim();
      if (text) items.push(text);
    }
  }

  return { title, items };
}
