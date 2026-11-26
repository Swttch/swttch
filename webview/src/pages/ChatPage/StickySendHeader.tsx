import { ReactNode, useContext, useEffect, useRef, useState } from 'react';
import { ChevronDoubleUpIcon } from '@heroicons/react/20/solid';
import { useTranslation } from '@/i18n';
import { useScrollFold, FOLD_MIN_HEIGHT } from './useScrollFold';
import { useTopBar } from '@/contexts/TopBarContext';
import { ScrollFoldContext } from './ScrollFoldContext';
import { SEND_JUMP_SCROLL_MARGIN, SEND_SCROLL_OPTIONS } from './SendIndex/scrollToSend';
import { ChatFollowContext } from './ChatFollowContext';

interface Props {
  children: ReactNode;
  /** Fires on the bubble itself, not the jump button — see the stopPropagation below. */
  onClick: () => void;
}

/**
 * A user send pinned to the top of the chat for as long as its reply is on
 * screen, with a button that scrolls back to where it actually sits.
 *
 * The button only appears while the header is pinned. At rest the message is
 * already where the button would take you, so offering the jump there would be
 * a control that does nothing — and one drawn over every send in the
 * transcript at that.
 *
 * "Pinned" is read off a zero-height sentinel placed immediately above the
 * header rather than from scroll position. While the section sits at rest the
 * sentinel is below the top bar; once the section scrolls up far enough for the
 * header to stick, it has passed the bar. That is exactly the state we want, it
 * comes straight from the intersection callback, and it needs no scroll handler
 * — this list can hold thousands of entries, and one listener per section firing
 * on every frame is the kind of cost we do not add.
 *
 * The band at the top of the scroll container is behind the fixed top bar, so a
 * sentinel level with the container's top edge is hidden underneath, not
 * visible. What the observer watches is therefore a mark the bar's height above
 * the sentinel (zero once the bar is hidden, and then there is no band): it
 * leaves the viewport as the sentinel reaches the bar. The fold reads the same
 * number to decide how far the send has already travelled past it — two numbers
 * drifting apart would leave a send counted as pinned and as not yet arrived at
 * the same time.
 *
 * The mark stands in for an observer `rootMargin`, which is in the pixels of the
 * viewport. The UI zoom does not scale those, so the pin came later than the line
 * the fold counts from, and the bubble lost the difference in one step as it
 * pinned (#747). A CSS offset is scaled with everything else.
 */
export function StickySendHeader(props: Props) {
  const { children, onClick } = props;
  const { t } = useTranslation('chat');
  const { topBarHeight } = useTopBar();
  const releaseFollow = useContext(ChatFollowContext);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const pinMarkRef = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(false);
  const [scrollRoot, setScrollRoot] = useState<HTMLElement | null>(null);
  /*
    The send index does NOT get told anything from here.

    It needs to know which send the reader is on, and that is a question about
    position, not about crossing an edge — see readingLineSectionKey. This
    component's own observer answers a different one (is my header stuck to the
    top?), and lending it out produced a marker that never moved.

    What the rail does depend on is the sentinel below, and the section wrapper
    around it carrying `data-send-section`. Both are load-bearing for the jump
    and for the reading line.
  */

  useEffect(() => {
    const sentinel = sentinelRef.current;
    const mark = pinMarkRef.current;
    if (!sentinel || !mark) return;
    // ChatPage's message container, held onto so the fold can measure against
    // its top edge.
    setScrollRoot(sentinel.closest<HTMLElement>('[data-chat-scroll]'));
    // The mark is clipped away by that container as it passes its top edge.
    // A busy page gets several readings in one call, oldest first: the last one is where the mark is now.
    const observer = new IntersectionObserver(
      entries => setPinned(!entries[entries.length - 1].isIntersecting),
      { threshold: 0 },
    );
    observer.observe(mark);
    return () => observer.disconnect();
  }, []);

  const bubbleRef = useRef<HTMLDivElement>(null);
  const { height: foldHeight, restingHeight, wrapLoss } = useScrollFold(scrollRoot, pinned, bubbleRef, sentinelRef, topBarHeight);

  // What the fold takes off the bubble is added back here, immediately after
  // the pinned element and outside it.
  //
  // Sticky looks detached but keeps its slot in the flow, so a bubble that
  // shrinks in place drags the whole transcript up behind it. Holding the slot
  // open inside the sticky element fixes that but pins the empty part to the
  // screen too — a band of blank surface under the folded bubble, which is the
  // very space this feature exists to reclaim. Out here the sticky element
  // hugs the bubble, and the flow keeps its length regardless.
  //
  // The gap is the difference between the two numbers the fold already
  // produced, so it needs no measuring of its own: reading layout during
  // render would force a reflow every frame and still be a frame behind. Both
  // sides floor at one line, or they would drift apart once the fold bottoms
  // out and the spacer would keep growing under a bubble that had stopped.
  //
  // The box is not all that folds: the footer row and the padding around the
  // box change too (see `wrapLoss`), and the slot has to come out the same
  // length folded or not. A transcript that changes length when this pins or
  // unpins drags a view that follows the bottom along with it, and that moves
  // the sentinel back across the line that decided to pin — the bubble then
  // flips between folded and unfolded every frame.
  const spacer = foldHeight === null
    ? 0
    : Math.max(restingHeight - Math.max(foldHeight, FOLD_MIN_HEIGHT), 0) + Math.max(wrapLoss, 0);

  const scrollToSelf = () => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    // A reply streaming in must not pull the view back under the jump.
    releaseFollow?.();
    // The options are shared with the send index, so a jump lands the same way
    // whichever control started it — see SEND_SCROLL_OPTIONS.
    sentinel.scrollIntoView(SEND_SCROLL_OPTIONS);
  };

  return (
    <>
      {/*
        The scroll margin is the breathing room a jump leaves above the
        message; scrollIntoView would otherwise park it flush against the top
        edge with the preceding reply cut off mid-line right above it.

        --- tweak this ---
          SEND_JUMP_SCROLL_MARGIN is the one number that controls it. It is a
          constant rather than `scroll-mt-16` because the send index builds its
          reading line from it: moving the landing spot without moving that
          line puts the rail's marker one send behind every jump.
      */}
      <div
        ref={sentinelRef}
        data-send-sentinel
        aria-hidden
        className="relative h-0"
        style={{ scrollMarginTop: SEND_JUMP_SCROLL_MARGIN }}
      >
        {/*
          What the pin observer watches — see above. A pixel tall: the first send
          of a conversation rests exactly on the line, and a zoomed layout can put
          it a fraction of a pixel past it, which a mark with no height reads as
          gone.
        */}
        <div ref={pinMarkRef} className="absolute inset-x-0 h-px" style={{ top: -topBarHeight }} />
      </div>
      <div
        className="sticky top-0 z-[1] group"
        /*
          Content passing under the pinned message fades out instead of
          meeting a hard edge, the way Cursor's extension does it.

          A flat `bg-surface-base` cut the scrolled text off along a line
          that read as a seam. The gradient is opaque across the message
          itself and falls off below it, so text thins out as it travels
          under rather than disappearing at a boundary.

          `--surface-base-rgb` is the channel triplet the theme exposes
          for exactly this (Tailwind's own `bg-surface-base/80` is built
          on it), so the alpha goes straight into `rgb(... / a)` and the
          fade follows the IDE theme along with everything else.

          The falloff is squeezed into the last stretch (opaque to 88%,
          then 0.6 / 0.3 / 0) so it lands on the trailing edge rather
          than washing over the message box itself — the box keeps a
          solid backdrop and stays readable while text thins out below
          it. Raise 88% for an even later, sharper fade; spread the
          three tail stops apart for a softer one.
        */
        style={{
          background:
            'linear-gradient(to bottom,' +
            ' rgb(var(--surface-base-rgb)) 88%,' +
            ' rgb(var(--surface-base-rgb) / 0.6) 90%,' +
            ' rgb(var(--surface-base-rgb) / 0.3) 95%,' +
            ' rgb(var(--surface-base-rgb) / 0) 100%)',
        }}
        onClick={onClick}
      >
        {/*
          Wraps the bubble so the fold can read its resting height as the send
          pins. It must not carry styling of its own — the height read here is
          the number the whole fold counts down from.
        */}
        <div ref={bubbleRef}>
          <ScrollFoldContext.Provider value={pinned && foldHeight !== null ? { height: foldHeight, restingHeight } : null}>
            {children}
          </ScrollFoldContext.Provider>
        </div>
        {pinned && (
          <button
            type="button"
            aria-label={t('chatMessageArea.jumpToMessage')}
            title={t('chatMessageArea.jumpToMessage')}
            // The wrapper logs the raw JSONL entry on click; without this the
            // jump would trigger that too.
            onClick={e => {
              e.stopPropagation();
              scrollToSelf();
            }}
            className="absolute bottom-1 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-1.5 py-1.5 bg-surface-raised border border-border-default rounded-lg shadow-md text-xs text-text-primary hover:bg-surface-hover transition-all opacity-0 group-hover:opacity-100 cursor-pointer"
          >
            <ChevronDoubleUpIcon className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      {/* Stands in for the height the fold took off the bubble — see above. */}
      <div aria-hidden style={{ height: spacer }} />
    </>
  );
}
