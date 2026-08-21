import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StickySendHeader } from '../StickySendHeader';
import { FOLD_MAX_HEIGHT, FOLD_MIN_HEIGHT } from '../useScrollFold';

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
 */
function giveBubblesHeight(px: number) {
  Element.prototype.getBoundingClientRect = function () {
    return { height: px, top: 0, bottom: px, left: 0, right: 0, width: 0, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
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

  it('disconnects its observer on unmount', () => {
    const { unmount } = render(<StickySendHeader onClick={() => {}}>msg</StickySendHeader>);
    unmount();
    // One per section, and a transcript holds thousands — leaking them would
    // keep every unmounted section observed for the life of the page.
    expect(disconnected).toBe(1);
  });
});
