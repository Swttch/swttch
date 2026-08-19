import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StickySendHeader } from '../StickySendHeader';

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

afterEach(() => {
  vi.unstubAllGlobals();
});

/** The sentinel leaving the viewport is what "pinned to the top" means here. */
function setPinned(pinned: boolean) {
  act(() => fire?.(!pinned));
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

  it('disconnects its observer on unmount', () => {
    const { unmount } = render(<StickySendHeader onClick={() => {}}>msg</StickySendHeader>);
    unmount();
    // One per section, and a transcript holds thousands — leaking them would
    // keep every unmounted section observed for the life of the page.
    expect(disconnected).toBe(1);
  });
});
