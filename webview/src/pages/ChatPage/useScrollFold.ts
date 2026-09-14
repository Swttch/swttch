import { RefObject, useEffect, useState } from 'react';

/** The tallest a bubble gets before `MessageBox` caps it. */
export const FOLD_MAX_HEIGHT = 280;

/**
 * How little of a folded send is left showing — deliberately a few pixels more
 * than one line.
 *
 * One line comes to 31px (1rem text at leading-1.5, plus MessageBox's
 * `py-[3.5px]` top and bottom), and stopping exactly there made a folded send
 * indistinguishable from one that was only ever one line long. At 38 the
 * second line is clipped mid-height, which reads as "there is more here"
 * without spelling it out.
 *
 * A genuinely short send is not padded up to this: the drawn height is capped
 * at the bubble's own resting height, so a one-line send stays one line.
 *
 * Raising it shows more of the second line; below ~31 the first line itself
 * starts to clip.
 */
export const FOLD_MIN_HEIGHT = 38;

/**
 * Where the top edge of the chat actually is, measured down from the scroll
 * container's own top.
 *
 * The container carries a `pt-10` whose 40px sit behind the fixed session
 * header, so a message level with the container's top edge is not visible —
 * it is underneath that header. Everything that asks "has this scrolled past
 * the top?" has to ask about this line instead, which is why the sentinel's
 * observer and the fold's starting distance both read from here rather than
 * each carrying their own 40.
 */
export const PINNED_TOP_INSET = 40;

/**
 * How much of a pinned send stays on screen, as it slides under the top edge.
 *
 * The send is pinned, so it does not scroll away with the rest of the
 * transcript. Instead it gives up a pixel of height for every pixel scrolled:
 * the bubble's bottom edge tracks where the message would have been, so it
 * reads as sinking into place rather than as a box that resizes itself.
 *
 * It starts from the height the bubble actually has, measured as it pins —
 * not from FOLD_MAX_HEIGHT, which is only the ceiling. Most sends are nowhere
 * near it, and a one-line send driven from the ceiling would be inflated to
 * 280px the moment it pinned and then "fold" back down to its own size.
 *
 * Returns the RAW height, which goes negative once the fold bottoms out. The
 * floor belongs to the render (`Math.max`, or CSS `min-height`), never to this
 * value or to any state built from it: clamping here would forget how far past
 * the bottom we scrolled, and scrolling back up would unfold the bubble
 * immediately instead of at the point it folded shut. Unfolding has to retrace
 * the same distance, and that only works while the overshoot is still in the
 * number.
 *
 * Cost: no listener of its own. The scroll container is the one element every
 * section shares, and only the pinned section — there is at most one — reads
 * from it. A listener per section, firing every frame across a transcript of
 * thousands, is the cost `StickySendHeader` avoids with its sentinel, and this
 * keeps to the same rule.
 */
export interface ScrollFold {
  /** Raw folded height; runs negative past the floor. `null` when at rest. */
  height: number | null;
  /** The bubble's height as it pinned — what the fold counts down from. */
  restingHeight: number;
}

export function useScrollFold(
  scrollRoot: HTMLElement | null,
  pinned: boolean,
  bubbleRef: RefObject<HTMLElement | null>,
  sentinelRef: RefObject<HTMLElement | null>,
): ScrollFold {
  const [fold, setFold] = useState<ScrollFold>({ height: null, restingHeight: FOLD_MAX_HEIGHT });

  useEffect(() => {
    // At rest the bubble is simply itself; nothing to track until it pins.
    if (!pinned) {
      setFold({ height: null, restingHeight: FOLD_MAX_HEIGHT });
      return;
    }
    const root = scrollRoot;
    if (!root) return;

    // The height this bubble wants when nothing is folding it.
    //
    // Reading it straight off the element is not enough: a send can re-pin
    // while a previous fold's inline height is still on the box, and then the
    // fold would count down from an already-folded number — measure, fold,
    // measure again, fold further. Tall sends hid this because `max-h-[280px]`
    // pinned their measurement to the same value every time; one-line sends
    // flickered. So the fold is lifted off first and the natural height read
    // underneath it, in one synchronous pass, before anything can paint.
    const bubble = bubbleRef.current;
    let start = FOLD_MAX_HEIGHT;
    if (bubble) {
      const box = bubble.querySelector<HTMLElement>('[data-message-box]') ?? bubble;
      const held = box.style.height;
      box.style.height = '';
      start = box.getBoundingClientRect().height;
      box.style.height = held;
    }

    // Track scrollTop, but start counting from where the send crossed the top
    // edge rather than from wherever it happened to pin.
    //
    // The two are the same thing while the user scrolls there by hand, and
    // nothing else. Reopening a session jumps the container straight to the
    // bottom or to the position it stored (`ChatPage`'s initial positioning),
    // and the send pins after that jump, having crossed the edge without a
    // single scroll event. Anchoring on that moment tells the fold the message
    // has not moved yet, so it is drawn at full height and stays there, with no
    // scrolling left below it to work the fold — the transcript opens under a
    // bubble the user has to scroll up past and come back down to collapse.
    //
    // So the distance already travelled is measured once, off the sentinel,
    // whose position is the very thing "pinned" was read from. Once only: it is
    // taken before any listener is attached and never read again. Measuring it
    // per frame would feed the fold its own output — the bubble shrinks, the
    // content below rises, scrollHeight drops, the browser nudges scrollTop to
    // keep the view in range, the sentinel lands somewhere new, and the next
    // frame shrinks again, a loop visible as a shudder along the bubble's
    // bottom edge. That is what scrollTop, which the fold cannot disturb, is
    // here to avoid; every later reading stays a plain difference against the
    // origin below.
    //
    // Never negative: a sentinel still below the edge has not been passed at
    // all, and the bubble should open whole.
    const sentinel = sentinelRef.current;
    const passed = sentinel
      ? Math.max(
          root.getBoundingClientRect().top + PINNED_TOP_INSET - sentinel.getBoundingClientRect().top,
          0,
        )
      : 0;
    const origin = root.scrollTop - passed;

    let frame = 0;
    const measure = () => {
      frame = 0;
      setFold({ height: start - (root.scrollTop - origin), restingHeight: start });
    };

    // Coalesce to one measurement per frame: a trackpad fires scroll events
    // faster than the compositor paints, and a layout read plus a setState on
    // every one of them is the expensive part — not the arithmetic.
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(measure);
    };

    measure();
    root.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      root.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [scrollRoot, pinned, bubbleRef, sentinelRef]);

  return fold;
}
