import { useTranslation } from '@/i18n';
import { stripSessionMentionTags } from '../ChatInput/sessionMentionTag';
import { parseCrossSessionPreview } from '../message-renderers/CrossSessionMessageRenderer';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CHAT_FOOTER_ID } from '../chatFooter';
import { matchesShortcut, shouldToggleOnShortcut } from '@/utils/shortcut';
import { isCliAuthoredText, type SessionSend } from '@/shared';
import { getTextContent } from '@/types';
import { useApi } from '@/contexts/ApiContext';
import { useSessionContext } from '@/contexts/SessionContext';
import { useWorkingDir } from '@/contexts/WorkingDirContext';
import type { SendSection } from '../groupIntoSendSections';
import { composeSendText, sendText } from '../sendText';
import { SendIndexList } from './SendIndexList';
import { scrollToSend } from './scrollToSend';
import { readingLineSectionKey } from './readingLine';
import { useTopBar } from '@/contexts/TopBarContext';

/**
 * How wide the rail is, in pixels.
 *
 * Exported because the scroll container has to reserve exactly this much
 * padding on its end side. The two numbers are the same number: if the rail is
 * drawn over content instead of beside it, one long file path or one wide table
 * is enough to send text underneath the ticks.
 */
export const SEND_INDEX_RAIL_WIDTH = 24;

/**
 * How far in from the end edge the rail sits, in pixels.
 *
 * The scrollbar has that edge. Sitting flush against it put the ticks on top of
 * the thumb, and the two are both thin vertical marks about position — reading
 * one as the other is the exact confusion to avoid.
 *
 * Wider than the scrollbar itself (8px) so the rail clears it with room to
 * spare rather than beginning exactly where the bar ends. The transcript still
 * reserves only SEND_INDEX_RAIL_WIDTH, so this inset is taken out of the gap
 * between the two rather than added to what the text gives up.
 */
export const SEND_INDEX_RAIL_INSET = 14;

/**
 * Which edge of the chat the rail sits on.
 *
 * `end` is the classic chat, where user messages are on the start side and the
 * end edge is free apart from the scrollbar. In the transcript view modes user
 * messages are on the end side, so the rail takes the start edge and is drawn
 * over the chat rather than beside it. See `railAtStart` in ChatPage.
 */
export type SendIndexSide = 'start' | 'end';

/** How far in from the start edge the rail sits when it is there. No scrollbar on that side, so less is needed. */
const SEND_INDEX_RAIL_INSET_START = 0;

/**
 * The rest of the gap on the start edge, as a margin class rather than a number so it can follow the width of the
 * window. The inset above stays 0 and this class is the one to tune.
 */
const SEND_INDEX_RAIL_MARGIN_START = 'ms-0 2xs:ms-1 xs:ms-2 sm:ms-4 md:ms-6';

/** Each tick is a hairline; the stack reads as a ruler rather than a list. */
const TICK_HEIGHT = 2;

/** Vertical space between two ticks at rest. Compressed once the session is long. */
const TICK_GAP = 6;

/**
 * The rail answers two questions with two separate channels, and never mixes
 * them.
 *
 * Length answers "where is the pointer": hovering raises a wave centred on the
 * row under it. Brightness answers "where am I reading": the current entry is
 * white and its neighbours fall off into the rest of the stack.
 *
 * Giving both questions to length was the first attempt and it does not work.
 * A long tick then means either of two unrelated things, and the moment the
 * pointer approaches the entry being viewed the two meanings sit on the same
 * tick with no way to tell them apart.
 *
 * The resting length is short and the peak nearly fills the rail, so the wave
 * is a change in shape rather than a change in size. A tall resting tick makes
 * the lift a matter of degree, which has to be compared against neighbours to
 * be noticed at all.
 *
 * The peak plus the rail's end inset is exactly SEND_INDEX_RAIL_WIDTH. Raise it
 * further and the lifted ticks reach past the padding the transcript reserved,
 * putting them over text.
 */
const TICK_LENGTH = 6;
const TICK_LENGTH_PEAK = 22;

/**
 * How many rows out the hover wave and the current-entry glow reach.
 *
 * The wave is the wider of the two. It exists to be seen as a shape, and a
 * shape needs rows on both sides of its peak; the glow only has to say which
 * single row is being read.
 */
const HOVER_WAVE_REACH = 4;
const CURRENT_GLOW_REACH = 3;

/**
 * How much every tick grows while the rail holds keyboard focus.
 *
 * This is what stands in for the focus ring. The platform outline is drawn
 * around the element's box, and the rail's box is a 24px strip of nothing with
 * hairlines inside it, so an outline would ring the empty strip rather than the
 * thing the user is now driving.
 */
const TICK_LENGTH_FOCUS_GAIN = 2;

/** How long a tick is held before the list of every send opens, in milliseconds. */
const SEND_LIST_HOLD_MS = 400;

/** Tick opacity for a row outside the current entry's glow. */
const TICK_OPACITY_REST = 0.35;

/**
 * Least opacity the hovered row may have.
 *
 * Hover does not own the brightness channel, so a hovered tick far from the
 * current entry would otherwise sit at rest brightness and the pointer would
 * have nothing to land on.
 */
const TICK_OPACITY_HOVER_FLOOR = 0.7;

/**
 * A wave that peaks at the hovered row and settles by `HOVER_WAVE_REACH`.
 *
 * Raised cosine rather than a linear ramp: a ramp meets the resting rows at a
 * corner, and the stack reads as a triangle someone drew rather than a surface
 * being lifted.
 */
export function tickLength(distanceFromHover: number | null, isFocused = false): number {
  let length = TICK_LENGTH;
  if (distanceFromHover !== null && distanceFromHover < HOVER_WAVE_REACH) {
    const falloff = (1 + Math.cos((Math.PI * distanceFromHover) / HOVER_WAVE_REACH)) / 2;
    length = TICK_LENGTH + (TICK_LENGTH_PEAK - TICK_LENGTH) * falloff;
  }
  // Focus lengthens every tick together, which is why it is a gain on top of
  // the wave rather than a state of its own. The clamp is what keeps the peak
  // inside the padding the transcript reserved: a lifted tick is already at the
  // rail's full width, so the gain has nowhere left to go there and shows up on
  // the rows that are still at rest.
  return isFocused ? Math.min(length + TICK_LENGTH_FOCUS_GAIN, TICK_LENGTH_PEAK) : length;
}

/**
 * Brightness falling off from the entry being viewed.
 *
 * Squared rather than cosine, so the current row keeps a clear lead over its
 * immediate neighbour. The wave wants a smooth shoulder; this one wants a
 * single unmistakable row.
 */
export function tickOpacity(distanceFromCurrent: number | null, isHovered: boolean): number {
  let opacity = TICK_OPACITY_REST;
  if (distanceFromCurrent !== null && distanceFromCurrent < CURRENT_GLOW_REACH) {
    const falloff = (1 - distanceFromCurrent / CURRENT_GLOW_REACH) ** 2;
    opacity = TICK_OPACITY_REST + (1 - TICK_OPACITY_REST) * falloff;
  }
  return isHovered ? Math.max(opacity, TICK_OPACITY_HOVER_FLOOR) : opacity;
}

/**
 * How many lines of the send the preview card shows.
 *
 * One line is not enough. Instructions in a long session repeat their opening
 * words ("fix the", "now make it"), and a single truncated line leaves several
 * entries looking identical.
 */
const CARD_MAX_LINES = 4;

/** Card width in pixels, wide enough for a sentence without covering the transcript. */
const CARD_WIDTH = 280;

/** One row of the rail: a send, and the text its preview card shows. */
interface SendIndexEntry {
  /** The section this send opens, which is also how a jump finds it. */
  key: string;
  text: string;
  /**
   * Whether the transcript currently holds this send.
   *
   * Never drawn. A tick looks the same either way on purpose: which sends we
   * have fetched is our paging arrangement, not a property of the conversation,
   * and a dimmer tick reads as a lesser or deleted message. It only decides
   * whether a jump can scroll straight there or has to load first.
   */
  loaded: boolean;
}

/**
 * The rail's rows: every send in the session, in transcript order.
 *
 * Two sources, joined rather than merged entry by entry. The loaded transcript
 * is authoritative from its oldest send onward, and the backend index covers
 * everything before that.
 *
 * Splitting them at that boundary — instead of taking the union and deduping —
 * is what keeps sends the index cannot name. A message typed while a turn was
 * running exists only as queue bookkeeping with no uuid; the transcript rebuilds
 * it locally under a key only the transcript can produce, so it appears in the
 * loaded half and nowhere else. A union keyed on uuid would drop it.
 */
export function buildEntries(
  sessionSends: SessionSend[],
  loadedSections: SendSection[],
): SendIndexEntry[] {
  const loaded = loadedSections
    // A section can open with something the CLI wrote (a finished-task note, an interrupt marker) that the
    // backend index leaves out; drawing it here would put a tick on the rail that vanishes once the same
    // send is read from the index instead (#657).
    .filter(section => section.head !== null && !isCliAuthoredText(getTextContent(section.head)))
    .map(section => ({ key: section.key, text: sendText(section.head!), loaded: true }));

  // Nothing loaded yet: the index is all there is to draw.
  if (loaded.length === 0) {
    return sessionSends.map(send => ({ key: send.uuid, text: composeSendText(send.preview), loaded: false }));
  }

  /*
    Where the loaded run begins inside the index: the first loaded send the index
    knows. The loaded run can open with sends the index has no entry for (a send
    typed while a turn was running, which only the transcript can name), so
    looking up only its very first send would miss and throw the whole index
    away, leaving a rail that grows by one tick per page scrolled (#657).

    No send found at all means the index is stale against the transcript — a
    rewind or an edit rebuilt the chain under it. Showing the loaded half alone
    is the honest answer there: it is the half we can still vouch for, and the
    query refetches on its own.
  */
  const indexed = new Set(sessionSends.map(send => send.uuid));
  const anchor = loaded.find(entry => indexed.has(entry.key));
  if (!anchor) return loaded;
  const boundary = sessionSends.findIndex(send => send.uuid === anchor.key);

  const older = sessionSends
    .slice(0, boundary)
    .map(send => ({ key: send.uuid, text: composeSendText(send.preview), loaded: false }));

  // What the index holds before the anchor comes first, minus anything the transcript already has.
  const loadedKeys = new Set(loaded.map(entry => entry.key));
  return [...older.filter(entry => !loadedKeys.has(entry.key)), ...loaded];
}

/**
 * Default keystrokes, until the settings rows that hold them exist.
 *
 * Alt rather than Ctrl/Cmd for the toggle, matching the voice shortcut's
 * reasoning: the Cmd and Ctrl rows are crowded by the browser and the terminal,
 * and Alt+F is unclaimed here (Alt+D is voice, Alt+K inserts a file path).
 *
 * Shift alone is enough for the two jumps because they are only listened for
 * while the rail holds focus, where nothing is being typed. A window-wide
 * binding could not take a plain letter like this.
 */
const TOGGLE_SHORTCUT_DEFAULT = 'Alt+F';
const PREV_SHORTCUT_DEFAULT = 'Shift+K';
const NEXT_SHORTCUT_DEFAULT = 'Shift+J';

/**
 * The keys that move the pointer, matched on release.
 *
 * Release is matched by the key alone, not by the full combination, because the
 * modifier is usually let go first: lifting Shift before K leaves the K keyup
 * carrying `shiftKey: false`, which no longer matches `Shift+K` and would strand
 * the pointer without ever jumping.
 */
const MOVE_KEYS = new Set(['ArrowUp', 'ArrowDown', 'K', 'J']);

function isMoveKey(key: string): boolean {
  return MOVE_KEYS.has(key.length === 1 ? key.toUpperCase() : key);
}

/**
 * The preview of one send, shown while its tick is under the pointer.
 *
 * Opens toward the transcript because the rail sits on the end edge and there
 * is nothing outside it to open into. Covering the transcript is what this
 * shape costs, and it is the same cost the products that ship it already pay.
 */
function SendIndexCard({ text, top, side, onEnter, onLeave }: { text: string; top: number; side: SendIndexSide; onEnter: () => void; onLeave: () => void }) {
  const { t } = useTranslation('chatTools');
  // A message from another session is shown by who sent it and what it says, not with its tags.
  // The chip an `@@` message opens with reads as its label, as it does in the bubble, not as its tag.
  const shown = stripSessionMentionTags(text);
  const cross = parseCrossSessionPreview(shown);
  const lines = (cross ? [`${t('crossSessionMessage.title')} ${cross.name}`.trim(), ...cross.body.split('\n')] : shown.split('\n')).slice(0, CARD_MAX_LINES);

  return (
    /*
      The card is reachable with the mouse, not just readable.

      It sits inside the row it belongs to, so the pointer moving onto it never
      leaves that row and the hover holds. The gap between tick and card is
      padding on this wrapper rather than margin on the card, so crossing the
      gap does not leave the element either — with margin the card would flicker
      out from under the cursor halfway across.
    */
    <div
      className={`absolute -translate-y-1/2 pointer-events-auto ${side === 'end' ? 'end-full pe-2' : 'start-full ps-2'}`}
      style={{ top }}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      <div
        className="bg-surface-raised border border-border-default rounded-lg shadow-md px-3 py-2 space-y-0.5 select-text cursor-auto"
        style={{ width: CARD_WIDTH }}
        /*
          The row beneath treats a click as "go to this send". Inside the card a
          click is someone starting to select text, which must not move the
          transcript out from under them.
        */
        onClick={e => e.stopPropagation()}
      >
        {lines.map((line, i) => (
          <div
            key={i}
            className={`text-xs leading-relaxed truncate ${
              i === 0 ? 'text-text-primary font-medium' : 'text-text-tertiary'
            }`}
          >
            {line}
          </div>
        ))}
        <div className="pt-1 text-[0.6875rem] text-text-tertiary/70">{t('sendIndex.holdHint')}</div>
      </div>
    </div>
  );
}

/**
 * A ruler of every send in the session, pinned to the end edge of the chat.
 *
 * The stack sits at the vertical middle of the viewport and stays there while
 * the transcript scrolls underneath, so "how far through this conversation am
 * I" is answered in the same place every time rather than moving with the
 * content it describes.
 *
 * Every send gets a tick, including the ones whose messages are not loaded yet.
 * Drawing those differently would report our own paging state as if it were a
 * property of the conversation, and a dimmer tick reads as a lesser or deleted
 * message rather than an unfetched one.
 */
interface Props {
  /** The edge of the chat the rail is on. */
  side: SendIndexSide;
  /** The transcript split by send, in transcript order. */
  sections: SendSection[];
  /** Every send in the session, loaded or not. See useSessionSends. */
  sessionSends: SessionSend[];
}

export function SendIndex(props: Props) {
  const { sections, sessionSends, side } = props;
  /*
    The row being pointed at, by mouse or by keyboard.

    One state for both because they mean the same thing to the reader: this is
    the send I am looking at without having gone there. Keeping them apart would
    let the wave peak in two places at once, and leave a stale card open beside
    a pointer that has moved on.
  */
  const [pointed, setPointed] = useState<number | null>(null);
  const [focused, setFocused] = useState(false);
  const railRef = useRef<HTMLDivElement>(null);

  const api = useApi();
  const { currentSessionId } = useSessionContext();
  const { workingDirectory } = useWorkingDir();

  /*
    Only sections that OPEN with a send get a tick. A headless section is the
    run of CLI-authored entries a transcript can start with — an older page
    beginning mid-reply, or a session resumed from a compact summary. Nobody
    sent those, so there is nothing for a tick to take the reader back to. What
    was asked before that run is carried in from the index instead; see
    carriedSend.
  */
  const entries = useMemo(
    () => buildEntries(sessionSends, sections),
    [sessionSends, sections],
  );

  /*
    A send the rail jumped to that the transcript had not loaded.

    Held until the entry turns up, then scrolled to. The load replaces the whole
    transcript rather than prepending a page, so there is no arrival callback to
    hang this on — the sections simply change, and the effect below notices.
  */
  const [pendingJump, setPendingJump] = useState<string | null>(null);

  useEffect(() => {
    if (!pendingJump) return;
    if (scrollToSend(pendingJump)) setPendingJump(null);
  }, [pendingJump, sections]);

  /*
    Which send the reader is on, measured off the transcript as it scrolls.

    Read here rather than reported by the sends themselves. Each send owns an
    observer that answers whether its header is stuck to the top, and reusing
    that answer for this question left the marker pinned to the bottom send for
    an entire session — the two edges are different, and an observer cannot say
    which side of one a sentinel is on. See readingLineSectionKey.

    Coalesced onto an animation frame: a scroll fires far more often than a
    frame is drawn, and nothing here can be seen more than once per frame.
  */
  const [readingKey, setReadingKey] = useState<string | null>(null);
  const { topBarHeight } = useTopBar();

  /*
    The vertical stretch the rail may occupy, in pixels from the top of the
    rail's positioned parent.

    Its top is under the top bar, its bottom the upper edge of the composer, so
    the rail never runs down behind the input box. Measured rather than assumed
    because the composer grows with what is typed and with the panels stacked
    on it. The rail takes whatever is left, so a taller window shows more ticks
    and a shorter one scrolls them; no count of ticks is ever fixed.
  */
  const [bounds, setBounds] = useState<{ top: number; height: number } | null>(null);
  const outerRef = useRef<HTMLDivElement>(null);

  const measureBounds = () => {
    const outer = outerRef.current;
    const parent = outer?.offsetParent as HTMLElement | null;
    if (!outer || !parent) return;
    // The page can be zoomed (the zoom control scales the root), and measured
    // boxes come back in screen pixels while top/height are set in the page's
    // own. The ratio between the two is the zoom.
    const zoom = outer.getBoundingClientRect().width / (outer.offsetWidth || 1) || 1;
    const parentTop = parent.getBoundingClientRect().top;

    const footer = document.getElementById(CHAT_FOOTER_ID);
    const bottom = footer ? (footer.getBoundingClientRect().top - parentTop) / zoom : parent.clientHeight;

    const next = { top: topBarHeight + 4, height: Math.max(Math.round(bottom - topBarHeight) - 8, 0) };
    setBounds(prev => (prev && prev.top === next.top && prev.height === next.height ? prev : next));
  };

  /*
    The bottom edge moves only when the composer does (it grows with what is
    typed and with the panels stacked on it) or the window does, so that is all
    this listens to. It is deliberately NOT measured on scroll: the transcript
    scrolls far more often than anything here changes.
  */
  useEffect(() => {
    measureBounds();
    const footer = document.getElementById(CHAT_FOOTER_ID);
    const observer = footer ? new ResizeObserver(measureBounds) : null;
    if (footer) observer?.observe(footer);
    window.addEventListener('resize', measureBounds);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measureBounds);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topBarHeight, entries.length > 0]);

  useEffect(() => {
    const scroller = document.querySelector<HTMLElement>('[data-chat-scroll]');
    if (!scroller) return;

    let frame = 0;
    const measure = () => {
      frame = 0;
      setReadingKey(readingLineSectionKey(topBarHeight));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };

    scroller.addEventListener('scroll', onScroll, { passive: true });
    // Also measure now: arriving at a session, and every page of older messages
    // prepended into it, moves the sends without anyone scrolling.
    measure();

    return () => {
      scroller.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [sections, topBarHeight]);

  /*
    The entry being read is the LAST one past the reading line, not the first.

    Every send above the viewport has crossed it, so the set grows as you scroll
    down and its newest member is the one whose reply fills the screen. Taking
    the first would leave the marker stuck at the top of the session for the
    whole conversation.

    Falling back to the opening send when nothing has crossed is what covers the
    top of the transcript, where no send has reached the line yet.
  */
  const current = useMemo(() => {
    /*
      A jump that is still loading marks its destination straight away.

      The transcript cannot report it yet — the send is not in the DOM — and
      leaving the marker where it was makes the click look like it missed. This
      is the rail keeping its half of the promise while the transcript catches
      up.
    */
    if (pendingJump) {
      const target = entries.findIndex(entry => entry.key === pendingJump);
      if (target !== -1) return target;
    }
    if (readingKey) {
      const at = entries.findIndex(entry => entry.key === readingKey);
      if (at !== -1) return at;
      /*
        The reading line is inside a section that has no tick of its own: one
        that opens with something the CLI wrote (an interrupt marker, a note
        from the app), which the rail leaves out. The reader is then still on
        the send before it, so walk back through the transcript for the nearest
        section that has a tick. Falling through to the top instead parked the
        marker on the first send of a long session that had just opened at its
        end.
      */
      const inTranscript = sections.findIndex(section => section.key === readingKey);
      for (let i = inTranscript - 1; i >= 0; i--) {
        const before = entries.findIndex(entry => entry.key === sections[i].key);
        if (before !== -1) return before;
      }
      // Nothing earlier in the loaded run has a tick, so the reader is past
      // every loaded send: on the last one the index holds before the run.
      if (inTranscript !== -1) {
        const firstLoaded = entries.findIndex(entry => entry.loaded);
        return firstLoaded === -1 ? entries.length - 1 : Math.max(firstLoaded - 1, 0);
      }
    }
    /*
      Nothing has reached the line, so the reader is above the first send in the
      transcript — which is the first LOADED tick, not the first tick.

      The ticks in front of it are sends further back in the session that the
      transcript has not fetched. None of them is in the document, so none can
      ever be measured, and marking index 0 would park the rail on the oldest
      send in the session for the whole conversation.
    */
    const firstLoaded = entries.findIndex(entry => entry.loaded);
    if (firstLoaded !== -1) return firstLoaded;
    return entries.length > 0 ? 0 : -1;
  }, [entries, sections, readingKey, pendingJump]);

  /*
    The toggle is listened for on the window because its whole purpose is to
    reach the rail from wherever the user is, which is normally the composer.

    Focus is the point of it, not a side effect. Showing the rail without
    handing it the keyboard would leave the two jump shortcuts unreachable by
    the same keystroke that just revealed the thing they drive.
  */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!shouldToggleOnShortcut(e, TOGGLE_SHORTCUT_DEFAULT)) return;
      const rail = railRef.current;
      if (!rail) return;
      // Alt+F types ƒ on macOS, so the composer would take a character on the
      // way past if this were left to bubble.
      e.preventDefault();
      if (document.activeElement === rail) rail.blur();
      else rail.focus();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  /*
    A jump is a scroll, not a selection. `current` is read back off the pinned
    sends, so moving the viewport is what moves the marker — there is no second
    copy of "where am I" to keep in step with the transcript.
  */
  const jumpTo = (index: number) => {
    const entry = entries[index];
    if (!entry) return;
    /*
      Ask the DOM first rather than trusting `loaded`.

      A send can be on screen without the transcript holding its entry: the
      header carried in above a page that opens mid-reply is exactly that, and
      it draws a real sentinel to land on. Reloading the session to reach
      something already in front of the user would throw the transcript away and
      rebuild it for nothing.
    */
    if (scrollToSend(entry.key)) return;
    /*
      The send is further back than the transcript has loaded. Ask for a page
      that reaches it — the backend widens back to the entry rather than
      windowing around it, so the transcript stays contiguous — and scroll once
      it lands.
    */
    if (!currentSessionId) return;
    setPendingJump(entry.key);
    void api.sessions.load(currentSessionId, workingDirectory ?? undefined, undefined, entry.key);
  };

  /*
    Holding a key walks the pointer; releasing it jumps.

    Scrolling on every keydown made a held key unwatchable: each press started a
    smooth scroll, the next press arrived before it finished and therefore
    measured a position that had not moved yet, and the transcript lurched a
    send at a time in fits. The two things were fighting because one keystroke
    was being asked to do both — choose, and go.

    Split apart, holding the key slides the pointer up the rail exactly as the
    mouse would, previewing each send's card on the way, and one scroll happens
    at the end. See `onKeyUp`.
  */
  const movePointer = (delta: number) =>
    setPointed(at => {
      const from = at ?? current;
      return Math.min(Math.max(from + delta, 0), entries.length - 1);
    });

  /*
    The arrow keys are not configurable and are always heard. Walking a list
    with them is not a preference, and a setting would be able to turn it off.

    Auto-repeat is deliberately NOT filtered here. A held key is how the pointer
    travels any distance, so every repeat has to land.
  */
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      setPointed(null);
      railRef.current?.blur();
      e.preventDefault();
      return;
    }
    if (e.key === 'Enter') {
      setPointed(null);
      setListOpen(open => !open);
      e.preventDefault();
      return;
    }
    if (e.key === 'ArrowUp' || matchesShortcut(e, PREV_SHORTCUT_DEFAULT)) {
      movePointer(-1);
      e.preventDefault();
      return;
    }
    if (e.key === 'ArrowDown' || matchesShortcut(e, NEXT_SHORTCUT_DEFAULT)) {
      movePointer(1);
      e.preventDefault();
    }
  };

  /*
    Release is the jump. Pressing the row rather than calling the handler keeps
    the keyboard and the pointer on one path — whatever a click does, this does.

    Enter still does nothing: the pointer is already where it is going, and the
    key that put it there is the key that commits it.
  */
  const onKeyUp = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!isMoveKey(e.key) || pointed === null) return;
    const tick = railRef.current?.querySelectorAll<HTMLElement>('[data-send-index-tick]')[pointed];
    tick?.click();
  };

  /*
    Ticks that the stretch has no room for are reached by scrolling the rail,
    and the rail says so: the edge that has more behind it fades out. A fade
    rather than an arrow or a count because it takes no room of its own, and
    ticks thinning out toward an edge read as "this goes on" without a legend.
  */
  const scrollRef = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState({ before: false, after: false });

  const measureMore = () => {
    const el = scrollRef.current;
    if (!el) return;
    const before = el.scrollTop > 1;
    const after = el.scrollTop + el.clientHeight < el.scrollHeight - 1;
    setMore(prev => (prev.before === before && prev.after === after ? prev : { before, after }));
  };

  // The tick being read, or the one the keyboard walked to, stays inside the
  // visible part of the rail. Not while the mouse is on a tick: the rail must
  // not move under the pointer.
  const followed = pointed ?? current;
  const mouseOnTick = useRef(false);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    const row = el?.children[followed] as HTMLElement | undefined;
    if (!el || !row || mouseOnTick.current) return;
    if (row.offsetTop < el.scrollTop) el.scrollTop = row.offsetTop - 8;
    else if (row.offsetTop + row.offsetHeight > el.scrollTop + el.clientHeight) {
      el.scrollTop = row.offsetTop + row.offsetHeight - el.clientHeight + 8;
    }
  }, [followed, entries.length, bounds?.height]);

  useLayoutEffect(measureMore, [entries.length, bounds?.height]);

  /*
    The card is drawn beside the rail, not inside the scrolling list: a list
    that scrolls clips what sticks out of it sideways, and the card sticks out
    by design. Its height follows the tick it belongs to.
  */
  const [cardTop, setCardTop] = useState<number | null>(null);
  /*
    Runs when the pointed tick changes and for nothing else. It used to list the
    rail's scroll state and bounds as well, and each of those is itself set by a
    layout effect, so one measurement could wake the next and the page fell over
    with "Maximum update depth exceeded" on a short window.

    It also never resets the position when nothing is pointed: the card is not
    drawn then, and writing null on every run was a state update with nothing to
    say.
  */
  useLayoutEffect(() => {
    const outer = outerRef.current;
    const row = pointed === null ? null : (scrollRef.current?.children[pointed] as HTMLElement | undefined);
    if (!outer || !row) return;
    const box = row.getBoundingClientRect();
    const outerBox = outer.getBoundingClientRect();
    // Screen pixels back to the page's own, as in measureBounds.
    const zoom = outerBox.width / (outer.offsetWidth || 1) || 1;
    const next = (box.top - outerBox.top + box.height / 2) / zoom;
    setCardTop(prev => (prev !== null && Math.abs(prev - next) < 0.5 ? prev : next));
  }, [pointed]);

  // Leaving a tick for the card must not drop the pointer on the way across
  // the gap between them, so letting go is deferred a moment and the card
  // cancels it.
  const leaveTimer = useRef<ReturnType<typeof setTimeout>>();
  const holdPointer = (i: number) => {
    clearTimeout(leaveTimer.current);
    mouseOnTick.current = true;
    setPointed(i);
  };
  const releasePointer = (i: number) => {
    clearTimeout(leaveTimer.current);
    leaveTimer.current = setTimeout(() => {
      mouseOnTick.current = false;
      setPointed(at => (at === i ? null : at));
    }, 120);
  };
  useEffect(() => () => clearTimeout(leaveTimer.current), []);

  /*
    Holding a tick opens the list of every send; a short press is still a click
    and jumps. The press is timed on the tick itself, and the click that follows
    a hold is swallowed so that letting go does not also jump.
  */
  const [listOpen, setListOpen] = useState(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout>>();
  const held = useRef(false);
  const startHold = () => {
    held.current = false;
    clearTimeout(holdTimer.current);
    holdTimer.current = setTimeout(() => {
      held.current = true;
      mouseOnTick.current = false;
      setPointed(null);
      setListOpen(true);
    }, SEND_LIST_HOLD_MS);
  };
  const cancelHold = () => clearTimeout(holdTimer.current);
  useEffect(() => () => clearTimeout(holdTimer.current), []);

  // The list closes on a press anywhere outside it and on Escape.
  useEffect(() => {
    if (!listOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!outerRef.current?.contains(e.target as Node)) setListOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setListOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [listOpen]);

  // A session with nothing sent yet has no ruler to draw, and an empty rail
  // would take room for nothing.
  if (entries.length === 0) return null;

  const fade = (more.before ? 'transparent 0, #000 18px' : '#000 0') + ', ' + (more.after ? '#000 calc(100% - 18px), transparent 100%' : '#000 100%');
  const mask = `linear-gradient(to bottom, ${fade})`;

  return (
    /*
      The strip is empty space around the ticks, so it takes no pointer events
      of its own: only a tick itself (and the card) answers the mouse. The
      pointer passing over the rail on its way elsewhere does nothing.
    */
    <div
      ref={outerRef}
      className={`absolute z-20 flex flex-col justify-center pointer-events-none ${side === 'start' ? SEND_INDEX_RAIL_MARGIN_START : ''}`}
      style={{
        width: SEND_INDEX_RAIL_WIDTH,
        ...(side === 'end'
          ? { insetInlineEnd: SEND_INDEX_RAIL_INSET }
          : { insetInlineStart: SEND_INDEX_RAIL_INSET_START }),
        top: bounds?.top ?? 0,
        height: bounds?.height ?? 0,
        visibility: bounds ? 'visible' : 'hidden',
      }}
    >
      <div
        ref={(node) => { (railRef as React.MutableRefObject<HTMLDivElement | null>).current = node; (scrollRef as React.MutableRefObject<HTMLDivElement | null>).current = node; }}
        data-send-index
        role="listbox"
        tabIndex={0}
        aria-label="Send index"
        aria-activedescendant={`send-index-entry-${current}`}
        onFocus={() => setFocused(true)}
        // Leaving the rail takes the pointer with it, so a card cannot be left
        // hanging over the transcript once the keyboard has gone elsewhere.
        onBlur={() => { setFocused(false); setPointed(null); }}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        onScroll={measureMore}
        /*
          `py-2` is unconditional so the rows never move. Only the background
          changes with focus; padding that appeared with it would shift every
          tick at the moment the user is trying to read where they are.

          The scrollbar is hidden: the fade at the edges is what says there is
          more, and a bar would sit beside ticks that are themselves a ruler.
        */
        className={`flex flex-col ${side === 'end' ? 'items-end' : 'items-start'} py-2 rounded-full outline-none transition-colors duration-150 max-h-full overflow-y-auto shrink-0 ${
          focused ? 'bg-surface-raised' : 'bg-transparent'
        }`}
        style={{ width: SEND_INDEX_RAIL_WIDTH, scrollbarWidth: 'none', msOverflowStyle: 'none', maskImage: mask, WebkitMaskImage: mask }}
      >
        {entries.map((entry, i) => {
          const isPointed = i === pointed;
          const fromPointer = pointed === null ? null : Math.abs(i - pointed);
          const fromCurrent = Math.abs(i - current);

          return (
            <div
              key={entry.key}
              id={`send-index-entry-${i}`}
              role="option"
              aria-selected={i === current}
              data-send-index-current={i === current ? 'true' : undefined}
              className={`relative flex items-center shrink-0 ${side === 'end' ? 'justify-end pe-0.5' : 'justify-start ps-0.5'}`}
              style={{ height: TICK_HEIGHT + TICK_GAP, width: SEND_INDEX_RAIL_WIDTH }}
            >
              {/*
                The tick is the target, and it is as long as it is drawn: a 2px
                line is hard to land on, so it is as tall as its row, but it is
                no wider than the line itself. Beside it the row is empty.
              */}
              <div
                data-send-index-tick
                className="h-full flex items-center cursor-pointer transition-[width] duration-150 pointer-events-auto"
                style={{ width: tickLength(fromPointer, focused) }}
                onMouseEnter={() => holdPointer(i)}
                onMouseLeave={() => { releasePointer(i); cancelHold(); }}
                onPointerDown={e => { if (e.button === 0) startHold(); }}
                onPointerUp={cancelHold}
                /*
                  Clicking takes the keyboard too, so the jumps that follow a
                  click land somewhere. Arriving by pointer and then pressing
                  Shift+J is the ordinary way to walk on from where you looked.
                */
                onClick={() => {
                  if (held.current) { held.current = false; return; }
                  jumpTo(i);
                  railRef.current?.focus();
                }}
              >
                <div
                  className="rounded-full bg-text-primary w-full"
                  style={{ height: TICK_HEIGHT, opacity: tickOpacity(fromCurrent, isPointed) }}
                />
              </div>
            </div>
          );
        })}
      </div>
      {listOpen && (
        <SendIndexList
          side={side}
          entries={entries}
          current={current}
          onPick={i => {
            setListOpen(false);
            jumpTo(i);
          }}
        />
      )}
      {!listOpen && pointed !== null && cardTop !== null && entries[pointed] && (
        <SendIndexCard
          side={side}
          text={entries[pointed].text}
          top={cardTop}
          onEnter={() => holdPointer(pointed)}
          onLeave={() => releasePointer(pointed)}
        />
      )}
    </div>
  );
}
