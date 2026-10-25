import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { hasCmdOrCtrl } from '@/hooks/useZoomControls';
import type { SessionSearchHit } from '@/shared';
import type { SessionSearchResult } from '@/api/modules/SessionsApi';
import type { SectionFoldValue } from '../SectionFoldContext';
import { collectMatches, type ChatSearchMatch } from './collectMatches';

/** Registered highlight names; the colours live in `chatSearch.css`. */
const HIGHLIGHT_ALL = 'chat-search';
const HIGHLIGHT_CURRENT = 'chat-search-current';

/** A burst of streamed text is searched once, not once per token. */
const RESEARCH_DELAY_MS = 150;

/** Typing is asked of the backend once the person pauses, not once per letter. */
const SEARCH_DELAY_MS = 200;

/**
 * How long a finished load is given to reach the screen before the bar acts on
 * it. The request is answered the moment the backend has sent the page; the
 * page is in the transcript a render later.
 */
const LOAD_SETTLE_MS = 50;

interface HighlightRegistry {
  set(name: string, highlight: unknown): void;
  delete(name: string): void;
}

function highlightRegistry(): HighlightRegistry | null {
  const registry = (CSS as unknown as { highlights?: HighlightRegistry }).highlights;
  return registry ?? null;
}

function paint(matches: ChatSearchMatch[], current: number): void {
  const registry = highlightRegistry();
  const HighlightCtor = (globalThis as unknown as { Highlight?: new (...ranges: Range[]) => unknown }).Highlight;
  if (!registry || !HighlightCtor) return;
  registry.set(HIGHLIGHT_ALL, new HighlightCtor(...matches.map((m) => m.range)));
  const here = matches[current];
  if (here) registry.set(HIGHLIGHT_CURRENT, new HighlightCtor(here.range));
  else registry.delete(HIGHLIGHT_CURRENT);
}

function unpaint(): void {
  const registry = highlightRegistry();
  registry?.delete(HIGHLIGHT_ALL);
  registry?.delete(HIGHLIGHT_CURRENT);
}

/** Brings the match to the middle of the scroll container. */
function scrollToMatch(match: ChatSearchMatch, scroller: HTMLElement | null): void {
  // A card closed with <details> keeps its text in the document but draws none
  // of it, so there is nothing to scroll to until it is opened.
  for (let el = match.range.startContainer.parentElement?.closest('details'); el; el = el.parentElement?.closest('details')) {
    if (!el.open) el.open = true;
  }
  if (!scroller) return;
  // More than one pass because a send's header is `position: sticky`: until its
  // reply is on screen it sits where the section starts, and once it is on
  // screen it pins to the top, so where it is after the first move is not where
  // the first measurement said. The loop stops as soon as the match is visible.
  for (let pass = 0; pass < 4; pass++) {
    const rect = match.range.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return;
    const box = scroller.getBoundingClientRect();
    const visible = rect.top >= box.top && rect.bottom <= box.bottom;
    if (visible && pass > 0) return;
    scroller.scrollTop += rect.top - box.top - scroller.clientHeight / 2;
  }
}

interface Options {
  /** The element that holds the rendered transcript. Null while nothing is drawn. */
  rootRef: RefObject<HTMLElement | null>;
  /** False while there is no transcript to search (empty session, no folder). */
  enabled: boolean;
  /** Changes whenever the transcript's text, or what of it is loaded, may have changed. */
  contentVersion: unknown;
  /** Names the session on screen; the backend's answers belong to one session. */
  sessionKey: string | null;
  /** Asks the backend which entries of the whole session contain the text. */
  searchSession: (query: string) => Promise<SessionSearchResult>;
  /** True when the entry with this uuid is in the transcript right now. */
  isEntryLoaded: (uuid: string) => boolean;
  /** Loads the transcript back to that entry, and no further. Resolves once the page was served. */
  loadThrough: (uuid: string) => Promise<void>;
  /**
   * Called just before the bar moves the view to a match.
   *
   * The page follows the bottom of the transcript for as long as the reader has
   * not moved away, and it learns that the reader moved by watching the scroll
   * position frame by frame. A jump to a match that sits at the top of what is
   * loaded sets off the load of the page above it in the same frame, and the
   * page put in above rewrites the page's own record of the position, so the
   * frame loop never sees the view go up. It keeps following, and pulls the view
   * back to the bottom a moment later. A jump is the reader moving away, so the
   * page is told so here.
   */
  beforeJump?: () => void;
  fold: SectionFoldValue;
}

/**
 * What the page hands the find bar so it can reach beyond the screen: the
 * backend search, the question of what is already loaded, and the way to load
 * more. The page owns all three because loading older history is tied to the
 * page's scroll-position bookkeeping.
 */
export type ChatSearchSource = Pick<Options, 'sessionKey' | 'searchSession' | 'isEntryLoaded' | 'loadThrough' | 'beforeJump'>;

export interface ChatSearch {
  isOpen: boolean;
  /** Rises on every open request, so the bar can take focus again while already open. */
  focusNonce: number;
  query: string;
  setQuery: (query: string) => void;
  /** Occurrences in the whole session, loaded or not. */
  total: number;
  /** True when the backend stopped counting at its limit, so `total` is a floor. */
  truncated: boolean;
  /**
   * Zero-based position of the highlighted match among all of them, in the order
   * they appear in the conversation (the oldest is 0); meaningless when `total` is 0.
   */
  current: number;
  /** True while the bar is waiting: for the backend's answer or for older history to arrive. */
  isLoadingHistory: boolean;
  open: () => void;
  close: () => void;
  /** Goes to the next match: the next one down the conversation, which is the next newer one. */
  next: () => void;
  /** Goes to the previous match: the next one up the conversation, which is the next older one. */
  previous: () => void;
}

/**
 * Find-in-chat for the transcript (issue #531).
 *
 * The transcript is paged, and loading all of a long session to look for one
 * word would put every page of it on the screen for a search. So the work is
 * split by who can do it cheaply:
 *
 * - The BACKEND searches the whole session (`SEARCH_SESSION`) and answers with
 *   which entries contain the text and how many times, without sending them.
 *   That gives the count at once, and says where the matches that are not on
 *   the screen are.
 * - The PAGE counts what it draws, in the part that is loaded. Where the two
 *   disagree about a loaded entry the page is right, because the page's text is
 *   the text the person sees.
 * - Moving to a match in the part that is not loaded loads the transcript back
 *   to that match's entry and no further (`loadThrough`).
 *
 * Matches are numbered in the order they appear in the conversation, so "up" is
 * "previous" and "down" is "next" on the screen and in the count alike. The
 * search STARTS at the newest match, which is where the person is reading. That
 * order is also the one in which neither a page arriving at the front nor text
 * streaming in at the end moves the number of a match that is already being
 * shown (`pointer`).
 *
 * Matches are painted with the CSS Custom Highlight API, which colours ranges of
 * text without touching the DOM React owns.
 */
export function useChatSearch(options: Options): ChatSearch {
  const { rootRef, enabled, contentVersion, sessionKey, fold } = options;

  const [isOpen, setIsOpen] = useState(false);
  const [focusNonce, setFocusNonce] = useState(0);
  const [query, setQueryState] = useState('');
  // The version of the content a list was found in travels with it: a list from
  // before the last page landed must not be scrolled to as if it were whole.
  const [matchSet, setMatchSet] = useState<{ matches: ChatSearchMatch[]; version: unknown }>({ matches: [], version: undefined });
  const [answer, setAnswer] = useState<{ query: string; hits: SessionSearchHit[]; truncated: boolean } | null>(null);
  // Index of the shown match among all of them in document order, or null for
  // "the newest", which is where every search starts.
  const [pointer, setPointer] = useState<number | null>(null);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);

  // Navigation scrolls; a refresh caused by streaming text must not.
  const scrollRequest = useRef(false);
  const restoreFocusTo = useRef<Element | null>(null);
  const loadingRef = useRef(false);
  const attempts = useRef(new Map<string, number>());

  const foldRef = useRef(fold);
  foldRef.current = fold;
  const searchRef = useRef(options.searchSession);
  searchRef.current = options.searchSession;
  const loadRef = useRef(options.loadThrough);
  loadRef.current = options.loadThrough;
  const beforeJumpRef = useRef(options.beforeJump);
  beforeJumpRef.current = options.beforeJump;
  const isLoadedRef = useRef(options.isEntryLoaded);
  isLoadedRef.current = options.isEntryLoaded;

  const domMatches = matchSet.matches;
  const hits = answer && answer.query === query ? answer.hits : null;

  // The entries the backend found that the transcript does not hold yet. The
  // backend lists them newest first and the transcript only ever grows at its
  // front, so these are always the oldest of the hits.
  const unloaded = useMemo(
    () => (hits ? hits.filter((h) => !isLoadedRef.current(h.uuid)) : []),
    // `contentVersion` is what changes when a page arrives and a hit becomes loaded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hits, contentVersion],
  );
  const unloadedTotal = useMemo(() => unloaded.reduce((n, h) => n + h.count, 0), [unloaded]);

  const total = unloadedTotal + domMatches.length;
  const shown = total === 0 ? -1 : pointer === null ? total - 1 : Math.min(Math.max(pointer, 0), total - 1);
  // Where the shown match sits among the ones on the screen, when it is on it.
  const domIndex = shown - unloadedTotal;
  const isSearching = isOpen && query.length > 0 && hits === null;

  const setQuery = useCallback((value: string) => {
    setQueryState(value);
    setPointer(null);
    scrollRequest.current = true;
  }, []);

  const open = useCallback(() => {
    // Every press asks for the box again, including when the bar is already
    // open and focus has wandered off to the composer.
    setFocusNonce((n) => n + 1);
    setIsOpen((wasOpen) => {
      if (!wasOpen) restoreFocusTo.current = document.activeElement;
      return true;
    });
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    unpaint();
    const back = restoreFocusTo.current;
    restoreFocusTo.current = null;
    if (back instanceof HTMLElement) back.focus();
  }, []);

  // Cmd+F on macOS, Ctrl+F elsewhere. Ctrl+F on macOS stays the composer's
  // "move right one character" (issue #506), which `hasCmdOrCtrl` leaves alone.
  //
  // `altKey` is deliberately not read. The IDE's embedded browser reports a
  // plain Cmd+F with `altKey: true` as well (seen in the page's own keydown on
  // IDE 2024.2 for macOS), so refusing Alt here meant the key reached the page
  // and nothing happened.
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.shiftKey || !hasCmdOrCtrl(e) || e.key.toLowerCase() !== 'f') return;
      e.preventDefault();
      e.stopPropagation();
      open();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [enabled, open]);

  // Leaving the transcript (another session, empty state) ends the search.
  useEffect(() => {
    if (!enabled) setIsOpen(false);
  }, [enabled]);

  useEffect(() => {
    setIsOpen(false);
    setAnswer(null);
    attempts.current.clear();
  }, [sessionKey]);

  // Ask the backend about the whole session once the person pauses typing.
  // A failed search is not an error the bar shows: it falls back to counting
  // what is loaded, which is still a working find.
  useEffect(() => {
    if (!isOpen || query.length === 0) {
      setAnswer(null);
      attempts.current.clear();
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      searchRef.current(query).then(
        (result) => {
          if (!cancelled) setAnswer({ query, hits: result.hits, truncated: result.truncated });
        },
        () => {
          if (!cancelled) setAnswer({ query, hits: [], truncated: false });
        },
      );
    }, SEARCH_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isOpen, query, sessionKey]);

  // Find the matches in the loaded part again whenever the query or the text
  // under it changes.
  useLayoutEffect(() => {
    if (!isOpen || query.length === 0) {
      setMatchSet({ matches: [], version: contentVersion });
      unpaint();
      return;
    }
    const run = () => {
      const root = rootRef.current;
      setMatchSet({ matches: root ? collectMatches(root, query) : [], version: contentVersion });
    };
    if (scrollRequest.current) {
      run();
      return;
    }
    const timer = setTimeout(run, RESEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [isOpen, query, contentVersion, fold, rootRef]);

  // Paint, and move to the shown match when the person asked to. When the match
  // is in the part that is not loaded, this is also what loads it.
  useLayoutEffect(() => {
    if (!isOpen) return;
    paint(domMatches, domIndex >= 0 && domIndex < domMatches.length ? domIndex : -1);

    if (!scrollRequest.current || shown < 0) return;

    if (shown < unloadedTotal) {
      // Which hit owns the shown match: the unloaded ones are counted from the
      // newest, the shown index from the oldest.
      let rest = unloadedTotal - 1 - shown;
      let target: SessionSearchHit | undefined;
      for (const hit of unloaded) {
        if (rest < hit.count) {
          target = hit;
          break;
        }
        rest -= hit.count;
      }
      if (!target || loadingRef.current) return;

      const uuid = target.uuid;
      const tries = (attempts.current.get(uuid) ?? 0) + 1;
      attempts.current.set(uuid, tries);
      if (tries > 2) {
        // The backend named an entry the transcript cannot be made to hold (the
        // chain moved under it). Stop counting it rather than ask for ever.
        setAnswer((a) => (a ? { ...a, hits: a.hits.filter((h) => h.uuid !== uuid) } : a));
        return;
      }
      loadingRef.current = true;
      setIsLoadingOlder(true);
      loadRef.current(uuid)
        .catch(() => {
          attempts.current.set(uuid, 99);
        })
        .finally(() => {
          setTimeout(() => {
            loadingRef.current = false;
            setIsLoadingOlder(false);
          }, LOAD_SETTLE_MS);
        });
      return;
    }

    if (loadingRef.current) return;
    if (matchSet.version !== contentVersion) return;
    const here = domMatches[domIndex];
    if (!here) return;
    if (here.foldedSectionKey !== null && foldRef.current.isCollapsed(here.foldedSectionKey)) {
      // Unfolding re-renders and re-collects; the request is still pending, so
      // the scroll happens then, once the match has a place on screen.
      foldRef.current.toggle(here.foldedSectionKey);
      return;
    }
    scrollRequest.current = false;
    beforeJumpRef.current?.();
    scrollToMatch(here, rootRef.current?.closest<HTMLElement>('[data-chat-scroll]') ?? null);
  }, [isOpen, matchSet, contentVersion, shown, unloaded, unloadedTotal, domIndex, domMatches, isLoadingOlder, rootRef]);

  useEffect(() => unpaint, []);

  const step = useCallback(
    (delta: number) => {
      if (total === 0) return;
      scrollRequest.current = true;
      setPointer((previous) => {
        const at = previous === null ? total - 1 : Math.min(previous, total - 1);
        return (at + delta + total) % total;
      });
    },
    [total],
  );
  const next = useCallback(() => step(1), [step]);
  const previous = useCallback(() => step(-1), [step]);

  return {
    isOpen,
    focusNonce,
    query,
    setQuery,
    total,
    truncated: answer !== null && answer.query === query && answer.truncated,
    current: total === 0 ? 0 : shown,
    isLoadingHistory: isLoadingOlder || isSearching,
    open,
    close,
    next,
    previous,
  };
}
