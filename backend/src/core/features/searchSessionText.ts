import { loadActiveChain, type SessionMessage } from './loadSessionMessages';
import type { SessionSearchHit } from '../../shared';

/**
 * How many occurrences are counted before the search stops.
 *
 * One letter in a very long session would otherwise produce a hit list as long
 * as the session and a count nobody can use. The webview shows the cut-off as
 * such rather than as a total.
 */
export const SESSION_SEARCH_MATCH_LIMIT = 2000;

export interface SessionSearchResult {
  /** Entries that contain the text, newest first. */
  hits: SessionSearchHit[];
  /** Occurrences across `hits`; at most SESSION_SEARCH_MATCH_LIMIT. */
  total: number;
  /** True when the limit stopped the search, so older entries were not looked at. */
  truncated: boolean;
}

/**
 * `<system-reminder>` blocks are CLI bookkeeping that the transcript cuts out of
 * a user message before drawing it, so they are not text the person can see and
 * a search must not find them.
 */
const SYSTEM_REMINDER = /<system-reminder>[\s\S]*?<\/system-reminder>/g;

function textOfBlockContent(content: unknown): string[] {
  if (typeof content === 'string') return [content];
  if (!Array.isArray(content)) return [];
  const texts: string[] = [];
  for (const item of content) {
    if (item && typeof item === 'object' && (item as Record<string, unknown>).type === 'text') {
      const text = (item as Record<string, unknown>).text;
      if (typeof text === 'string') texts.push(text);
    }
  }
  return texts;
}

/**
 * The pieces of text an entry puts on the screen, one string per piece.
 *
 * Kept as separate pieces rather than joined, because a match has to sit inside
 * one unbroken run of text on the screen too (the webview searches the rendered
 * text node by node), and joining them would count a phrase that straddles two
 * blocks as found.
 *
 * This is the backend's account of what the transcript shows, and it is
 * deliberately close to it rather than equal to it: messages, replies, the
 * output of tools and the plain text of what a tool was asked to do. Thinking,
 * images and the CLI's own bookkeeping entries are left out. Where the screen
 * and this disagree the screen wins once the entry is loaded; the webview counts
 * what it draws and only trusts this for entries it has not loaded yet.
 */
export function visibleTextsOf(entry: SessionMessage): string[] {
  if (entry.type !== 'user' && entry.type !== 'assistant') return [];
  if (entry.isMeta === true) return [];

  const message = entry.message as Record<string, unknown> | undefined;
  const content = message?.content;
  const texts: string[] = [];

  if (typeof content === 'string') {
    texts.push(content);
  } else if (Array.isArray(content)) {
    for (const block of content) {
      if (!block || typeof block !== 'object') continue;
      const b = block as Record<string, unknown>;
      if (b.type === 'text' && typeof b.text === 'string') {
        texts.push(b.text);
      } else if (b.type === 'tool_result') {
        texts.push(...textOfBlockContent(b.content));
      } else if (b.type === 'tool_use' && b.input && typeof b.input === 'object') {
        for (const value of Object.values(b.input as Record<string, unknown>)) {
          if (typeof value === 'string') texts.push(value);
        }
      }
    }
  }

  return entry.type === 'user' ? texts.map(t => t.replace(SYSTEM_REMINDER, '')) : texts;
}

/** Non-overlapping, case-insensitive occurrences of `needle` in `text`. */
function countIn(text: string, needle: string): number {
  const haystack = text.toLowerCase();
  // A few characters change length when lowercased, which would shift every
  // offset after them. The webview skips such a run too, so it is not counted.
  if (haystack.length !== text.length) return 0;
  let count = 0;
  for (let from = haystack.indexOf(needle); from !== -1; from = haystack.indexOf(needle, from + needle.length)) {
    count++;
  }
  return count;
}

/**
 * Search a session's whole history for `query`, without loading any of it into
 * the transcript.
 *
 * Reads the same cached active chain the pager serves from, so a search on a
 * session the person is already looking at costs a scan of memory rather than a
 * second parse of the file. Newest entry first, because that is the order the
 * find bar walks them in: the first match it shows is the one closest to where
 * the person is reading.
 */
export async function searchSessionText(
  workingDir: string,
  targetSessionId: string,
  query: string,
  matchLimit = SESSION_SEARCH_MATCH_LIMIT,
): Promise<SessionSearchResult> {
  const needle = query.toLowerCase();
  if (needle.length === 0) return { hits: [], total: 0, truncated: false };

  const chain = await loadActiveChain(workingDir, targetSessionId);
  const hits: SessionSearchHit[] = [];
  let total = 0;

  for (let i = chain.length - 1; i >= 0; i--) {
    const entry = chain[i];
    if (typeof entry.uuid !== 'string') continue;

    let count = 0;
    for (const text of visibleTextsOf(entry)) count += countIn(text, needle);
    if (count === 0) continue;

    hits.push({ uuid: entry.uuid, count });
    total += count;
    if (total >= matchLimit) return { hits, total, truncated: true };
  }

  return { hits, total, truncated: false };
}
