import { countsTowardPage, PAGE_RECORDS_PER_ENTRY } from '@/shared';

/**
 * Which part of a long transcript the webview keeps in memory (#680).
 *
 * A session can hold tens of thousands of entries. Keeping every entry that was
 * ever paged in is what made the panel's renderer grow past a gigabyte, so the
 * webview holds a window of PAGES instead:
 *
 *   - the NEWEST `latestPages` pages (the "fixed" pages), which are never dropped,
 *     so "scroll to bottom" never has to wait for the backend; and
 *   - a RECYCLER of `historyPages` pages centred on the page the reader is on:
 *     `above` pages older than it, `below` pages newer than it. When the reader
 *     moves, the pages that are now too far are dropped and the pages that came
 *     within reach are loaded.
 *
 * Which pages should be held is therefore decided by one thing, the reader's page,
 * and not by which way they are scrolling or how tall anything is on the screen.
 *
 * When the recycler does not touch the fixed pages there is a GAP between them:
 * entries the backend has and the webview let go of. It is described by the two
 * entries on either side, because a cursor the backend can follow has to be a real
 * entry uuid. There is never more than one gap.
 *
 * A page is `pageSize` entries of the conversation with every record between them, not `pageSize`
 * records (see `countsTowardPage`, which the backend cuts its pages by).
 *
 * Everything here is a pure function over the flat message array the transcript
 * already renders. Nothing in this file knows about React, the DOM or the bridge.
 *
 * The rule that keeps the cursors exact: a cut (where entries are dropped, where a
 * page begins, where a page is joined to what is held) only ever happens in front
 * of an entry that has a uuid. Entries without one (progress notes, summaries)
 * belong to the uuid entry before them, exactly as the backend groups them when it
 * cuts pages (see `snapStartToUuid` in backend loadSessionMessages), so a cut never
 * separates them from it and a cursor never points at an entry that is not there.
 */

export interface WindowEntry {
  uuid?: string | null;
  /** What kind of record it is, which says whether a page counts it. */
  type?: unknown;
}

/** The hole between the recycler's last page and the pages after it. */
export interface WindowGap {
  /** The last entry before the hole. The next entry is NOT held. */
  afterUuid: string;
  /** The first entry after the hole. The entry before it is NOT held. */
  beforeUuid: string;
}

export interface WindowState {
  gap: WindowGap | null;
  /** The backend has entries older than the first one held. */
  hasOlder: boolean;
  /**
   * The uuid each held page begins with, oldest first. Pages are what the window
   * counts in, and a page is whatever one request to the backend returned; the
   * newest page is also cut into pages of `pageSize` as the stream grows it (see
   * `pageSpans`), which needs no entry here.
   */
  starts: string[];
}

export interface WindowConfig {
  /** Entries of the conversation per page. */
  pageSize: number;
  /** Pages of the newest entries that are never dropped. */
  latestPages: number;
  /** Pages in the recycler, centred on the reader's page. */
  historyPages: number;
  /**
   * Whether pages the reader is far from are let go of. False keeps everything loaded, as the chat did
   * before the window: the stepper then only closes a hole a jump left, and loading older pages is the
   * caller's, by how close the reader is to the top. Undefined means true.
   */
  recycle?: boolean;
}

export interface WindowResult<T extends WindowEntry> {
  messages: T[];
  state: WindowState;
}

/** A page: the messages `[from, to)` of the held array. */
export interface PageSpan {
  from: number;
  to: number;
  /** The uuid the page begins with. */
  start: string;
}

const hasUuid = (entry: WindowEntry | undefined): entry is WindowEntry & { uuid: string } =>
  !!entry && typeof entry.uuid === 'string';

export const EMPTY_WINDOW_STATE: WindowState = { gap: null, hasOlder: false, starts: [] };

/** The uuid of the last entry that has one, which is what the next page is asked for. */
export function lastUuidOf(entries: readonly WindowEntry[]): string | null {
  for (let i = entries.length - 1; i >= 0; i--) {
    const uuid = entries[i].uuid;
    if (typeof uuid === 'string') return uuid;
  }
  return null;
}

/** The uuid of the first entry that has one, which is what the next older page is asked for. */
export function firstUuidOf(entries: readonly WindowEntry[]): string | null {
  for (const entry of entries) if (typeof entry.uuid === 'string') return entry.uuid;
  return null;
}

/** Index of the entry that follows the gap, or -1 with no gap. */
export function gapIndex(messages: readonly WindowEntry[], gap: WindowGap | null): number {
  if (!gap) return -1;
  return messages.findIndex(m => m.uuid === gap.beforeUuid);
}

/**
 * The state as it applies to these messages: a gap naming an entry that is not held
 * describes nothing, and the page starts are those that are held, in order, with the
 * first held entry always one of them.
 */
export function normalizeState<T extends WindowEntry>(messages: readonly T[], state: WindowState): WindowState {
  const at = state.gap ? gapIndex(messages, state.gap) : -1;
  const gap = state.gap && at > 0 ? state.gap : null;
  const wanted = new Set(state.starts);
  const first = firstUuidOf(messages);
  if (first !== null) wanted.add(first);
  if (gap) wanted.add(gap.beforeUuid);
  const starts: string[] = [];
  for (const m of messages) if (hasUuid(m) && wanted.has(m.uuid)) starts.push(m.uuid);
  const same = gap === state.gap && starts.length === state.starts.length && starts.every((u, i) => u === state.starts[i]);
  return same ? state : { ...state, gap, starts };
}

/**
 * The pages of the held messages, oldest first.
 *
 * The pages are cut where `starts` says. The NEWEST of them is also cut into pages of
 * `pageSize` entries, counted from its start, as long as at least a page remains after
 * the cut: that is how the stream's new entries become pages, so that the newest
 * `latestPages` pages stay a bounded number of entries however long a session runs.
 */
export function pageSpans<T extends WindowEntry>(
  messages: readonly T[],
  state: WindowState,
  config: Pick<WindowConfig, 'pageSize'>,
): PageSpan[] {
  const bounds: number[] = [];
  const startSet = new Set(state.starts);
  for (let i = 0; i < messages.length; i++) {
    const uuid = messages[i].uuid;
    if (typeof uuid === 'string' && startSet.has(uuid)) bounds.push(i);
  }
  if (bounds.length === 0) {
    const first = messages.findIndex(hasUuid);
    if (first === -1) return [];
    bounds.push(first);
  }
  // Entries before the first start (entries without a uuid) belong to the first page.
  bounds[0] = 0;

  const spans: PageSpan[] = [];
  for (let b = 0; b < bounds.length; b++) {
    const from = bounds[b];
    const to = b + 1 < bounds.length ? bounds[b + 1] : messages.length;
    const start = firstUuidOf(messages.slice(from, to)) ?? '';
    spans.push({ from, to, start });
  }

  // Cut the newest page into pages of `pageSize`.
  const newest = spans[spans.length - 1];
  const cuts = pageCuts(messages, newest.from, config.pageSize);
  if (cuts.length > 0) {
    spans.pop();
    let from = newest.from;
    for (const cut of cuts) {
      spans.push({ from, to: cut, start: firstUuidOf(messages.slice(from, cut)) ?? '' });
      from = cut;
    }
    spans.push({ from, to: newest.to, start: firstUuidOf(messages.slice(from, newest.to)) ?? '' });
  }
  return spans;
}

/**
 * Where the pages after the one that begins at `from` begin: each `pageSize` entries of the conversation on (or as many
 * records as that many may bring), at the next entry that has a uuid, as long as at least a page remains after the cut.
 */
function pageCuts<T extends WindowEntry>(messages: readonly T[], from: number, pageSize: number): number[] {
  const limit = pageSize * PAGE_RECORDS_PER_ENTRY;
  // How many counted entries are at or after each index, which says whether a page remains there.
  const countedFrom = new Array<number>(messages.length + 1).fill(0);
  for (let i = messages.length - 1; i >= from; i--) {
    countedFrom[i] = countedFrom[i + 1] + (countsTowardPage(messages[i]) ? 1 : 0);
  }
  const cuts: number[] = [];
  let start = from;
  for (;;) {
    let at = start;
    while (at < messages.length && countedFrom[start] - countedFrom[at] < pageSize && at - start < limit) at++;
    while (at < messages.length && !hasUuid(messages[at])) at++;
    if (at >= messages.length || (countedFrom[at] < pageSize && messages.length - at < limit)) return cuts;
    cuts.push(at);
    start = at;
  }
}

/** The index (into `spans`) of the page that holds the message at `messageIndex`. */
export function pageIndexAt(spans: readonly PageSpan[], messageIndex: number): number {
  for (let i = 0; i < spans.length; i++) if (messageIndex < spans[i].to) return i;
  return Math.max(0, spans.length - 1);
}

/** The first page of the newest pages: pages before it are the recycler's, whether held or not. */
export function fixedStartOf(spans: readonly PageSpan[], config: Pick<WindowConfig, 'latestPages'>): number {
  return Math.max(0, spans.length - config.latestPages);
}

/** Pages the recycler keeps older than the reader's, and newer than it. */
export function recyclerReach(config: Pick<WindowConfig, 'historyPages'>): { above: number; below: number } {
  const others = Math.max(0, config.historyPages - 1);
  return { above: Math.ceil(others / 2), below: Math.floor(others / 2) };
}

/** The first page of what is held that follows the gap, or -1 with no gap. */
function pageAfterGap(spans: readonly PageSpan[], gap: WindowGap | null): number {
  if (!gap) return -1;
  return spans.findIndex(s => s.start === gap.beforeUuid);
}

/** The first page of a session: everything the backend sent is the newest pages, with no gap. */
export function loadInitial<T extends WindowEntry>(entries: T[], hasOlder: boolean): WindowResult<T> {
  const first = firstUuidOf(entries);
  return { messages: entries, state: { gap: null, hasOlder, starts: first === null ? [] : [first] } };
}

function withoutHeld<T extends WindowEntry>(page: readonly T[], held: readonly WindowEntry[]): T[] {
  const heldUuids = new Set<string>();
  for (const entry of held) if (typeof entry.uuid === 'string') heldUuids.add(entry.uuid);
  return page.filter(entry => !hasUuid(entry) || !heldUuids.has(entry.uuid));
}

/** An older page arrived: it goes in front of everything held, and is a page of its own. */
export function prependOlder<T extends WindowEntry>(
  messages: readonly T[],
  state: WindowState,
  page: readonly T[],
  pageHasOlder: boolean,
): WindowResult<T> {
  const fresh = withoutHeld(page, messages);
  const start = firstUuidOf(fresh);
  return {
    messages: [...fresh, ...messages],
    state: { ...state, hasOlder: pageHasOlder, starts: start === null ? state.starts : [start, ...state.starts] },
  };
}

/**
 * A newer page arrived: it goes right after the recycler's last page, where the gap is.
 *
 * When the page runs into the pages after the gap the two are joined and the gap is
 * gone. Two things say so: their first entry turning up inside the page (the page is cut
 * in front of it, so nothing is held twice), and `reached`, the backend's word that the
 * page ends exactly where those pages begin. The second cannot be read off the uuids: a
 * page that ends right before them holds none of them.
 */
export function appendNewer<T extends WindowEntry>(
  messages: readonly T[],
  state: WindowState,
  page: readonly T[],
  reached = false,
): WindowResult<T> {
  const gap = state.gap;
  const at = gapIndex(messages, gap);
  if (!gap || at <= 0) return { messages: [...messages], state: { ...state, gap: null } };

  const history = messages.slice(0, at);
  const latest = messages.slice(at);

  const inside = page.findIndex(entry => entry.uuid === gap.beforeUuid);
  const between = withoutHeld(inside === -1 ? page : page.slice(0, inside), history);
  const start = firstUuidOf(between);
  const starts = start === null ? state.starts : insertStart(state.starts, start, gap.beforeUuid);

  if (reached || inside !== -1 || between.length === 0) {
    return { messages: [...history, ...between, ...latest], state: { ...state, gap: null, starts } };
  }
  return {
    messages: [...history, ...between, ...latest],
    state: { ...state, starts, gap: { afterUuid: lastUuidOf(between) ?? gap.afterUuid, beforeUuid: gap.beforeUuid } },
  };
}

/** `start` goes in the list in front of `before`. */
function insertStart(starts: readonly string[], start: string, before: string): string[] {
  const at = starts.indexOf(before);
  const out = starts.filter(s => s !== start);
  const index = at === -1 ? out.length : out.indexOf(before);
  out.splice(index === -1 ? out.length : index, 0, start);
  return out;
}

/**
 * An older page arrived for the other side of the gap: it was asked for with the first
 * entry after the gap as its cursor, so it goes in front of the pages after the gap,
 * where the gap is, rather than in front of everything held.
 *
 * This is how a reader who is on a page after the gap gets the pages right above them.
 * The gap closes when the page reaches the recycler's last entry, either by holding it or,
 * when `reached` says so, by beginning exactly after it. `hasOlder` is left alone: whether
 * anything lies before what is held is not something this page says.
 */
export function prependToLatest<T extends WindowEntry>(
  messages: readonly T[],
  state: WindowState,
  page: readonly T[],
  reached = false,
): WindowResult<T> {
  const gap = state.gap;
  const at = gapIndex(messages, gap);
  if (!gap || at <= 0) return { messages: [...messages], state: { ...state, gap: null } };

  const history = messages.slice(0, at);
  const latest = messages.slice(at);

  // Where the page and the recycler overlap, the entries after the recycler's last one
  // are new. The uuid-less entries right after that one belong to its group, which the
  // recycler already holds.
  const meets = page.findIndex(entry => entry.uuid === gap.afterUuid);
  let between: T[];
  if (meets === -1) {
    between = withoutHeld(page, messages);
  } else {
    let from = meets + 1;
    while (from < page.length && !hasUuid(page[from])) from++;
    between = withoutHeld(page.slice(from), messages);
  }
  const start = firstUuidOf(between);
  const starts = start === null ? state.starts : insertStart(state.starts, start, gap.beforeUuid);

  if (reached || meets !== -1 || between.length === 0) {
    return { messages: [...history, ...between, ...latest], state: { ...state, gap: null, starts } };
  }
  return {
    messages: [...history, ...between, ...latest],
    state: { ...state, starts, gap: { afterUuid: gap.afterUuid, beforeUuid: start ?? gap.beforeUuid } },
  };
}

/**
 * What was asked for around an entry far from what is held arrived (the find bar or the send
 * index jumping to it): it takes the place of the recycler. The newest pages stay.
 * When it overlaps what is held it is joined to it instead.
 *
 * It is several pages' worth (as many as the recycler keeps), and is held as that many pages,
 * so that the reader moving on lets go of one at a time.
 */
export function jumpTo<T extends WindowEntry>(
  messages: readonly T[],
  state: WindowState,
  page: readonly T[],
  pageHasOlder: boolean,
  config: WindowConfig,
): WindowResult<T> {
  const joined = joinAround(messages, state, page, pageHasOlder, config);
  const inner = pageSpans(page, { gap: null, hasOlder: false, starts: [] }, config).map(span => span.start);
  const starts = [...joined.state.starts, ...inner];
  return { messages: joined.messages, state: normalizeState(joined.messages, { ...joined.state, starts }) };
}

/** Where what arrived goes among what is held. */
function joinAround<T extends WindowEntry>(
  messages: readonly T[],
  state: WindowState,
  page: readonly T[],
  pageHasOlder: boolean,
  config: WindowConfig,
): WindowResult<T> {
  const spans = pageSpans(messages, state, config);
  const at = pageAfterGap(spans, state.gap);
  // The newest pages: everything from the page after the gap on, or the last
  // `latestPages` pages of one contiguous run.
  const latestFrom = spans.length === 0 ? 0 : spans[at > 0 ? at : fixedStartOf(spans, config)].from;
  const latest = messages.slice(latestFrom);
  const latestFirst = firstUuidOf(latest);
  const latestStarts = state.starts.filter(u => latest.some(m => m.uuid === u));
  const pageStart = firstUuidOf(page);

  // 1. The page runs into the newest pages: the two are joined and the recycler is let go.
  const intoLatest = latestFirst === null ? -1 : page.findIndex(entry => entry.uuid === latestFirst);
  if (intoLatest !== -1) {
    const before = page.slice(0, intoLatest);
    const start = firstUuidOf(before);
    return {
      messages: [...before, ...latest],
      state: { gap: null, hasOlder: pageHasOlder, starts: start === null ? latestStarts : [start, ...latestStarts] },
    };
  }

  // 2. The page reaches the oldest entry held: it is an older page, only larger.
  const firstHeld = firstUuidOf(messages);
  if (firstHeld !== null && page.some(entry => entry.uuid === firstHeld)) {
    return prependOlder(messages, state, page, pageHasOlder);
  }

  // 3. The page starts inside the recycler and runs on toward the newest pages.
  if (state.gap && page.some(entry => entry.uuid === state.gap!.afterUuid)) {
    return appendNewer(messages, state, page);
  }

  // 4. The page touches nothing held. It becomes the recycler, with a gap before the newest pages.
  const afterUuid = lastUuidOf(page);
  if (afterUuid === null || latestFirst === null || pageStart === null) {
    return {
      messages: [...page, ...latest],
      state: { gap: null, hasOlder: pageHasOlder, starts: pageStart === null ? latestStarts : [pageStart, ...latestStarts] },
    };
  }
  return {
    messages: [...page, ...latest],
    state: {
      gap: { afterUuid, beforeUuid: latestFirst },
      hasOlder: pageHasOlder,
      starts: [pageStart, ...(latestStarts.includes(latestFirst) ? latestStarts : [latestFirst, ...latestStarts])],
    },
  };
}

/** What the window needs next, given the reader's page. */
export type WindowStep =
  | { kind: 'none' }
  /** Let go of the page that begins with `start`. */
  | { kind: 'drop'; start: string }
  /** Ask for the page before `beforeUuid`, which goes in front of everything held. */
  | { kind: 'loadOlder'; beforeUuid: string }
  /** Ask for the page after `afterUuid`, which goes after the recycler. */
  | { kind: 'loadNewer'; afterUuid: string }
  /** Ask for the page before `beforeUuid`, which goes in front of the pages after the gap. */
  | { kind: 'loadBeforeLatest'; beforeUuid: string };

/**
 * The next thing to do to bring what is held to what the reader's pages call for, one
 * step at a time: dropping what is out of reach comes before loading what is within it,
 * and the fixed pages are never dropped.
 *
 * The reader is on the pages from `readerTop` to `readerBottom` (message indexes of the
 * first and last entry on the screen), which are one page when a page fills the screen
 * and several when pages are shorter than it. Counting from the oldest held page, with
 * the screen from page `top` to page `bottom`, the recycler keeps `above` pages older
 * than `top` and `below` pages newer than `bottom`. So:
 *   - a page older than `top - above` is dropped, from the oldest end;
 *   - a recycler page newer than `bottom + below` is dropped, from the end nearest the gap;
 *   - fewer than `above` pages older than `top` means the next older page is loaded;
 *   - fewer than `below` pages newer than `bottom` before the gap means the next newer one is.
 *
 * Measuring from the screen's edges and not from one point on it is what keeps the reader
 * from ever reaching the end of what is held: with a page much shorter than the screen,
 * the page under the middle of it can have `above` pages above it that all fit above the
 * screen's own top edge.
 */
export function nextStep<T extends WindowEntry>(
  messages: readonly T[],
  state: WindowState,
  config: WindowConfig,
  readerTop: number,
  readerBottom: number = readerTop,
): WindowStep {
  const spans = pageSpans(messages, state, config);
  if (spans.length === 0) return { kind: 'none' };
  const fixedStart = fixedStartOf(spans, config);
  const { above, below } = recyclerReach(config);
  const clamp = (i: number) => Math.min(Math.max(i, 0), messages.length - 1);
  const top = pageIndexAt(spans, clamp(readerTop));
  const bottom = Math.max(top, pageIndexAt(spans, clamp(readerBottom)));
  const gb = pageAfterGap(spans, state.gap);
  const hole = gb > 0;

  // Nothing is let go of: all that is left to do is to close a hole a jump left, page by page.
  if (config.recycle === false) {
    if (!hole || !state.gap) return { kind: 'none' };
    return top <= gb - 1
      ? { kind: 'loadNewer', afterUuid: state.gap.afterUuid }
      : { kind: 'loadBeforeLatest', beforeUuid: state.gap.beforeUuid };
  }

  // Dropping. Only recycler pages (older than the fixed ones) can be dropped.
  // 1. From the oldest end: pages older than the screen's first by more than `above`.
  if (fixedStart > 0 && top - above > 0) return { kind: 'drop', start: spans[0].start };
  // 2. After the gap, the pages that are no longer fixed (the stream pushed them out) and that the
  //    reader is not near go from the gap's side first.
  if (hole && gb < fixedStart && gb > bottom + below) return { kind: 'drop', start: spans[gb].start };
  // 3. The recycler's newest page, when it is more than `below` pages newer than the screen's last.
  const recyclerLast = hole ? gb - 1 : fixedStart - 1;
  if (recyclerLast >= 1 && recyclerLast > bottom + below) return { kind: 'drop', start: spans[recyclerLast].start };

  // Loading.
  // 4. Fewer pages older than the screen's first than the recycler keeps.
  if (state.hasOlder && top < above) {
    const oldest = firstUuidOf(messages);
    if (oldest !== null && !(hole && top >= gb)) return { kind: 'loadOlder', beforeUuid: oldest };
  }
  // 5. The screen starts in the recycler and fewer than `below` pages follow its last before the gap
  //    (none do, when the screen reaches the gap itself).
  if (hole && top <= gb - 1 && gb - 1 - bottom < below && state.gap) {
    return { kind: 'loadNewer', afterUuid: state.gap.afterUuid };
  }
  // 6. The screen starts after the gap, with fewer than `above` pages between the gap and it.
  if (hole && top >= gb && top - gb < above && state.gap) {
    return { kind: 'loadBeforeLatest', beforeUuid: state.gap.beforeUuid };
  }
  return { kind: 'none' };
}

/** Let go of the page that begins with `start`. The page must be a recycler page, one the stepper named. */
export function dropPage<T extends WindowEntry>(
  messages: readonly T[],
  state: WindowState,
  config: WindowConfig,
  start: string,
): WindowResult<T> {
  const spans = pageSpans(messages, state, config);
  const index = spans.findIndex(s => s.start === start);
  if (index === -1 || spans.length < 2) return { messages: [...messages], state };
  const span = spans[index];
  const kept = [...messages.slice(0, span.from), ...messages.slice(span.to)];
  const dropped = new Set<string>();
  for (const m of messages.slice(span.from, span.to)) if (hasUuid(m)) dropped.add(m.uuid);
  const starts = state.starts.filter(u => !dropped.has(u));

  const before = index > 0 ? lastUuidOf(messages.slice(0, span.from)) : null;
  const after = index + 1 < spans.length ? spans[index + 1].start : null;
  const gb = pageAfterGap(spans, state.gap);

  let gap: WindowGap | null = state.gap;
  let hasOlder = state.hasOlder;
  if (index === 0) {
    // The oldest page: nothing is held in front of what remains, and the backend has what was dropped.
    hasOlder = true;
    if (gb === 1) gap = null; // it was the whole recycler
    if (after !== null && !starts.includes(after)) starts.unshift(after);
  } else if (before !== null && after !== null) {
    if (gb > 0 && index === gb - 1) gap = { afterUuid: before, beforeUuid: state.gap!.beforeUuid };
    else if (gb > 0 && index === gb) gap = { afterUuid: state.gap!.afterUuid, beforeUuid: after };
    else gap = { afterUuid: before, beforeUuid: after };
    if (!starts.includes(after)) starts.push(after);
  }
  const normalized = normalizeState(kept, { gap, hasOlder, starts });
  return { messages: kept, state: normalized };
}
