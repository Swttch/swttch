import { ReactNode, useEffect, useRef, useState } from 'react';
import { ChevronDoubleUpIcon } from '@heroicons/react/20/solid';
import { useTranslation } from '@/i18n';
import { useScrollFold, FOLD_MIN_HEIGHT } from './useScrollFold';
import { ScrollFoldContext } from './ScrollFoldContext';

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
 * sentinel is in view; once the section scrolls up far enough for the header to
 * stick, the sentinel has left the viewport. That is exactly the state we want,
 * it comes straight from the intersection callback, and it needs no scroll
 * handler — this list can hold thousands of entries, and one listener per
 * section firing on every frame is the kind of cost we do not add.
 *
 * `rootMargin` cancels the scroll container's `pt-10`: the top 40px of the
 * viewport is behind the fixed session header, so without it the sentinel
 * counts as visible while hidden underneath and the button flickers on at the
 * wrong moment.
 */
export function StickySendHeader(props: Props) {
  const { children, onClick } = props;
  const { t } = useTranslation('chat');
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(false);
  const [scrollRoot, setScrollRoot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    // The same element the observer defaults to, held onto so the fold can
    // measure against its top edge.
    setScrollRoot(sentinel.closest<HTMLElement>('[data-chat-scroll]'));
    // Default root: the nearest scrollable ancestor, which is ChatPage's
    // message container.
    const observer = new IntersectionObserver(
      ([entry]) => setPinned(!entry.isIntersecting),
      { rootMargin: '-40px 0px 0px 0px', threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  const bubbleRef = useRef<HTMLDivElement>(null);
  const { height: foldHeight, restingHeight } = useScrollFold(scrollRoot, pinned, bubbleRef);

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
  const spacer = foldHeight === null
    ? 0
    : Math.max(restingHeight - Math.max(foldHeight, FOLD_MIN_HEIGHT), 0);

  const scrollToSelf = () => {
    // Same move as ChatPage's "scroll to bottom": let the browser do it, so a
    // reduced-motion preference is honoured without us reimplementing it.
    sentinelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <>
      {/*
        `scroll-mt-*` is the breathing room the jump leaves above the message.
        scrollIntoView would otherwise park it flush against the top edge,
        with the preceding reply cut off mid-line right above it — landing
        with a little of the previous section visible reads as arriving
        somewhere rather than being snapped to a boundary.

        --- tweak this ---
          scroll-mt-16 = 64px, and it is the one number that controls it
          (scroll-mt-12 = 48px, scroll-mt-20 = 80px). Stay on Tailwind's
          default scale: a value outside it emits no CSS at all and the
          margin silently becomes zero.
      */}
      <div ref={sentinelRef} aria-hidden className="h-0 scroll-mt-16" />
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
