/**
 * One place in the transcript where the search text occurs.
 */
export interface ChatSearchMatch {
  /** The characters that matched, as a live range over the rendered text. */
  range: Range;
  /**
   * The send section whose reply is folded away and holds this match, or null
   * when the match is on screen. A folded reply is hidden with CSS but stays in
   * the document (see `SectionFoldContext`), so its text is found like any
   * other and has to be unfolded before the match can be shown.
   */
  foldedSectionKey: string | null;
}

/** Text that is not part of the conversation, whatever the document holds. */
const SKIPPED_ELEMENTS = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'NOSCRIPT']);

/**
 * An element carrying this attribute is left out of the search together with
 * everything inside it. The search bar sets it on itself, so typing into the bar
 * can never find the bar.
 */
export const CHAT_SEARCH_SKIP_ATTRIBUTE = 'data-chat-search-skip';

function isSkipped(node: Text): boolean {
  for (let el = node.parentElement; el; el = el.parentElement) {
    if (SKIPPED_ELEMENTS.has(el.tagName)) return true;
    if (el.hasAttribute(CHAT_SEARCH_SKIP_ATTRIBUTE)) return true;
  }
  return false;
}

/** The send section key of the folded reply this text sits in, if there is one. */
function foldedSectionOf(node: Text): string | null {
  const body = node.parentElement?.closest<HTMLElement>('[data-section-body]');
  if (!body || body.style.display !== 'none') return null;
  return body.closest('[data-send-section]')?.getAttribute('data-send-section') ?? null;
}

/**
 * Every occurrence of `query` in the text under `root`, in document order.
 *
 * Case is ignored. A match has to sit inside a single text node, so a phrase
 * that a piece of formatting cuts in two (half of it in bold) is not found: the
 * range API cannot span the markup without cloning it, and a find bar that
 * rewrote the transcript's DOM would fight React for it.
 *
 * `limit` bounds the work on a transcript where the query is a single common
 * letter; the bar says the list is cut off rather than pretending it is whole.
 */
export function collectMatches(root: HTMLElement, query: string, limit = 2000): ChatSearchMatch[] {
  const needle = query.toLowerCase();
  if (needle.length === 0) return [];

  const matches: ChatSearchMatch[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);

  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    if (isSkipped(node)) continue;

    const haystack = node.data.toLowerCase();
    // A few characters change length when lowercased, which would shift every
    // offset after them. Such a node is left out rather than highlighted a
    // letter off.
    if (haystack.length !== node.data.length) continue;

    let from = haystack.indexOf(needle);
    if (from === -1) continue;

    const foldedSectionKey = foldedSectionOf(node);
    while (from !== -1) {
      const range = document.createRange();
      range.setStart(node, from);
      range.setEnd(node, from + needle.length);
      matches.push({ range, foldedSectionKey });
      if (matches.length >= limit) return matches;
      from = haystack.indexOf(needle, from + needle.length);
    }
  }

  return matches;
}
