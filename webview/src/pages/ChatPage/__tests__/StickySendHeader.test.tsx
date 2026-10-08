import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StickySendHeader } from '../StickySendHeader';
import { FOLD_MAX_HEIGHT, FOLD_MIN_HEIGHT, PINNED_TOP_INSET } from '../useScrollFold';
import { useScrollFoldValue } from '../ScrollFoldContext';

/**
 * The global setup installs an IntersectionObserver stub that never fires (it
 * exists so dnd-kit can construct one). These tests need to drive the callback,
 * so they swap in a stub that hands it back.
 */
let fire: ((isIntersecting: boolean) => void) | null = null;
let disconnected = 0;

beforeEach(() => {
  fire = null;
  disconnected = 0;
  // The fold coalesces to one measurement per frame; drive that clock so the
  // spacer settles synchronously.
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) =>
    setTimeout(() => cb(0), 16) as unknown as number,
  );
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
  class ControllableObserver implements IntersectionObserver {
    readonly root = null;
    readonly rootMargin = '';
    readonly thresholds: readonly number[] = [];
    constructor(cb: IntersectionObserverCallback) {
      fire = (isIntersecting: boolean) =>
        cb([{ isIntersecting } as IntersectionObserverEntry], this as IntersectionObserver);
    }
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {
      disconnected++;
    }
    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
  }
  vi.stubGlobal('IntersectionObserver', ControllableObserver);
});

const realGetBoundingClientRect = Element.prototype.getBoundingClientRect;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  Element.prototype.getBoundingClientRect = realGetBoundingClientRect;
  document.body.innerHTML = '';
});

/** The sentinel leaving the viewport is what "pinned to the top" means here. */
function setPinned(pinned: boolean) {
  act(() => fire?.(!pinned));
}

/**
 * The component looks up `[data-chat-scroll]` to read scroll position off, so
 * the header has to be rendered inside one for the fold to run at all.
 */
function inScrollContainer(): HTMLElement {
  const root = document.createElement('div');
  root.setAttribute('data-chat-scroll', '');
  document.body.append(root);
  return root;
}

/**
 * The fold counts down from the bubble's measured height, and jsdom reports 0
 * for everything — so a send would pin at height 0 and never fold. Standing in
 * a resting height is what makes the spacer observable at all.
 *
 * `sentinelTop` places the sentinel relative to the scroll container's own top
 * edge, which stands at 0 here. Below `PINNED_TOP_INSET` is above the line the
 * chat actually starts at, i.e. already scrolled past — the state a restored
 * session opens in. The default sits exactly on that line: a send that has
 * just arrived and travelled nothing.
 */
function giveBubblesHeight(px: number, sentinelTop = PINNED_TOP_INSET) {
  Element.prototype.getBoundingClientRect = function () {
    const top = (this as HTMLElement).hasAttribute?.('data-send-sentinel') ? sentinelTop : 0;
    return { height: px, top, bottom: top + px, left: 0, right: 0, width: 0, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
  };
}

function scrollBy(px: number) {
  const root = document.querySelector('[data-chat-scroll]') as HTMLElement;
  root.scrollTop += px;
  act(() => {
    root.dispatchEvent(new Event('scroll'));
    vi.advanceTimersByTime(16);
  });
}

/** The spacer is the last child: an empty, aria-hidden block after the header. */
function spacerHeight(container: HTMLElement): number {
  const spacer = container.querySelector('[aria-hidden][style*="height"]:last-child')
    ?? container.lastElementChild;
  const h = (spacer as HTMLElement)?.style.height;
  return h ? parseFloat(h) : 0;
}

const jumpLabel = /jump to this message/i;

describe('StickySendHeader', () => {
  it('hides the jump button while the message sits at rest', () => {
    render(<StickySendHeader onClick={() => {}}>msg</StickySendHeader>);
    // Offering a jump to where the user already is would be a control that
    // does nothing — drawn over every send in the transcript.
    setPinned(false);
    expect(screen.queryByRole('button', { name: jumpLabel })).toBeNull();
  });

  it('shows the jump button once the message is pinned', () => {
    render(<StickySendHeader onClick={() => {}}>msg</StickySendHeader>);
    setPinned(true);
    expect(screen.getByRole('button', { name: jumpLabel })).toBeTruthy();
  });

  it('keeps the group/group-hover pair that reveals the button', () => {
    // Presence in the DOM is all the assertion above can see: the button is
    // `opacity-0` until the header is hovered, and jsdom applies no CSS. The
    // two classes are what make it appear, and dropping either one leaves a
    // button that is permanently invisible while every other test here still
    // passes — so the pairing itself is pinned itemwise.
    render(<StickySendHeader onClick={() => {}}>msg</StickySendHeader>);
    setPinned(true);

    const button = screen.getByRole('button', { name: jumpLabel });
    expect(button.className).toContain('group-hover:opacity-100');
    expect(button.closest('.group')).not.toBeNull();
  });

  it('scrolls back to its own position when the button is clicked', async () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;

    render(<StickySendHeader onClick={() => {}}>msg</StickySendHeader>);
    setPinned(true);
    await userEvent.click(screen.getByRole('button', { name: jumpLabel }));

    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
  });

  it('does not fire the wrapper handler when the jump button is clicked', async () => {
    // The wrapper logs the raw JSONL entry behind the bubble; a jump must not
    // trigger that too.
    const onClick = vi.fn();
    Element.prototype.scrollIntoView = vi.fn();

    render(<StickySendHeader onClick={onClick}>msg</StickySendHeader>);
    setPinned(true);
    await userEvent.click(screen.getByRole('button', { name: jumpLabel }));

    expect(onClick).not.toHaveBeenCalled();
  });

  it('still reports a click on the message itself', async () => {
    const onClick = vi.fn();
    render(<StickySendHeader onClick={onClick}>msg</StickySendHeader>);
    await userEvent.click(screen.getByText('msg'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('adds no spacer while the send is at rest', () => {
    const { container } = render(<StickySendHeader onClick={() => {}}>msg</StickySendHeader>, {
      container: inScrollContainer(),
    });
    setPinned(false);
    expect(spacerHeight(container)).toBe(0);
  });

  it('gives back outside itself exactly what the fold took off the bubble', () => {
    giveBubblesHeight(FOLD_MAX_HEIGHT);
    // Sticky keeps its slot in the flow, so a folding bubble drags the
    // transcript up behind it. The spacer stands in for the lost height —
    // outside the sticky element, so the flow keeps its length while nothing
    // empty is pinned to the screen. Inside it, the blank part would be pinned
    // too, which is the space this feature exists to reclaim.
    const { container } = render(<StickySendHeader onClick={() => {}}>msg</StickySendHeader>, {
      container: inScrollContainer(),
    });
    setPinned(true);

    // Freshly pinned: nothing folded yet, nothing to make up.
    expect(spacerHeight(container)).toBe(0);

    scrollBy(100);
    expect(spacerHeight(container)).toBe(100);

    // Floored with the bubble — past the floor the bubble stops shrinking, so
    // the spacer must stop growing or the two would drift apart.
    scrollBy(10_000);
    expect(spacerHeight(container)).toBe(FOLD_MAX_HEIGHT - FOLD_MIN_HEIGHT);
  });

  it('opens already folded when it pins somewhere it had long since scrolled past', () => {
    // Reopening a session does not scroll down through the transcript: ChatPage
    // jumps straight to the bottom (or to the position it stored), and only
    // then does the send pin. Counting the fold from that moment makes a
    // message the user scrolled past hours ago claim it has not moved yet, so
    // it opens at full height and stays there — the only way down being to
    // scroll up until it unpins and come back, which is the round trip this
    // covers.
    const passed = 200;
    giveBubblesHeight(FOLD_MAX_HEIGHT, PINNED_TOP_INSET - passed);
    const { container } = render(<StickySendHeader onClick={() => {}}>msg</StickySendHeader>, {
      container: inScrollContainer(),
    });
    setPinned(true);

    expect(spacerHeight(container)).toBe(passed);
  });

  it('still opens at full height when it pins right at the top edge', () => {
    // The ordinary case, and the one the distance above must not disturb: a
    // send that pins the instant it reaches the edge has travelled nothing, so
    // it is drawn whole and folds from there as the user keeps scrolling.
    giveBubblesHeight(FOLD_MAX_HEIGHT, PINNED_TOP_INSET);
    const { container } = render(<StickySendHeader onClick={() => {}}>msg</StickySendHeader>, {
      container: inScrollContainer(),
    });
    setPinned(true);

    expect(spacerHeight(container)).toBe(0);
    scrollBy(100);
    expect(spacerHeight(container)).toBe(100);
  });

  it('drops the spacer when the send unpins', () => {
    giveBubblesHeight(FOLD_MAX_HEIGHT);
    const { container } = render(<StickySendHeader onClick={() => {}}>msg</StickySendHeader>, {
      container: inScrollContainer(),
    });
    setPinned(true);
    scrollBy(100);
    expect(spacerHeight(container)).toBe(100);

    setPinned(false);
    expect(spacerHeight(container)).toBe(0);
  });

  it('keeps the transcript the same length across the fold, whatever the bubble wears around its box', () => {
    // The real send does not hold the same things around its message box in
    // both states: folded, the footer row is taken out and the padding changes
    // (UserMessageRenderer). If the header's slot in the flow shrinks by that
    // much when it pins, the transcript gets shorter, a view that follows the
    // bottom is dragged along, the sentinel crosses the pin line the other way,
    // the send unpins and grows back, and the whole thing repeats every frame.
    // The slot has to come out the same length folded or not, so what the wrap
    // lost is added back next to the box's own fold.
    const BOX = 100;
    // Image attachments and context chips sit in the wrapper in BOTH layouts.
    // They must not be counted as lost when the send folds: the spacer would
    // then hold open room that nothing took away.
    const CHIPS = 30;
    const UNFOLDED_WRAP = 16 + 24 + CHIPS; // padding + the footer slot (invisible, still there) + chips
    const FOLDED_WRAP = 24 + CHIPS; // bigger padding, footer gone, chips unchanged

    function Bubble() {
      const fold = useScrollFoldValue();
      const boxHeight = fold ? Math.min(Math.max(fold.height, FOLD_MIN_HEIGHT), fold.restingHeight) : undefined;
      return (
        <div data-test-wrap={fold ? 'folded' : 'unfolded'}>
          <div data-message-box style={boxHeight === undefined ? undefined : { height: boxHeight }} />
        </div>
      );
    }

    // Heights come from what is actually rendered, not from a single number.
    const heightOf = (el: HTMLElement): number => {
      if (el.hasAttribute('data-message-box')) return el.style.height ? parseFloat(el.style.height) : BOX;
      if (el.hasAttribute('data-test-wrap')) {
        const box = el.querySelector<HTMLElement>('[data-message-box]')!;
        return heightOf(box) + (el.getAttribute('data-test-wrap') === 'folded' ? FOLDED_WRAP : UNFOLDED_WRAP);
      }
      const wrap = el.firstElementChild as HTMLElement | null;
      return wrap?.hasAttribute('data-test-wrap') ? heightOf(wrap) : 0;
    };
    Element.prototype.getBoundingClientRect = function () {
      const el = this as HTMLElement;
      const top = el.hasAttribute?.('data-send-sentinel') ? PINNED_TOP_INSET : 0;
      const height = heightOf(el);
      return { height, top, bottom: top + height, left: 0, right: 0, width: 0, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
    };

    const { container } = render(
      <StickySendHeader onClick={() => {}}>
        <Bubble />
      </StickySendHeader>,
      { container: inScrollContainer() },
    );
    const slot = () => {
      const wrap = container.querySelector<HTMLElement>('[data-test-wrap]')!;
      return heightOf(wrap.parentElement as HTMLElement) + spacerHeight(container);
    };

    setPinned(false);
    const atRest = slot();
    expect(atRest).toBe(BOX + UNFOLDED_WRAP);

    setPinned(true);
    expect(slot()).toBe(atRest);

    scrollBy(60);
    expect(slot()).toBe(atRest);

    scrollBy(10_000);
    expect(slot()).toBe(atRest);

    // The line is crossed back and forth within a frame while the view is
    // pulled along: unpin and re-pin land before the unpin has been through its
    // own effects, so the re-pin renders on top of a fold that has not been
    // cleared yet. Reading the unfolded layout "as it pins" then reads the
    // folded one, finds nothing lost, and the transcript changes length with
    // every crossing. Seen in the shipped build, where it flipped every frame.
    for (let i = 0; i < 3; i++) {
      act(() => {
        fire?.(true); // unpinned
        fire?.(false); // pinned again, same batch
      });
      expect(slot()).toBe(atRest);
    }
  });

  it('disconnects its observer on unmount', () => {
    const { unmount } = render(<StickySendHeader onClick={() => {}}>msg</StickySendHeader>);
    unmount();
    // One per section, and a transcript holds thousands — leaking them would
    // keep every unmounted section observed for the life of the page.
    expect(disconnected).toBe(1);
  });
});
