import {describe, it, expect, afterEach} from 'vitest';
import {render, act} from '@testing-library/react';
import {useSoftWrapToggle} from '../useSoftWrapToggle';

/**
 * The per-block toggle (#179 follow-up) is a class swap, so what these cases
 * pin down is which class the block carries and where the button ends up — the
 * CSS that reads those classes is covered by theme/__tests__/softWrap.css.test.
 */
function Host() {
  const softWrap = useSoftWrapToggle();
  return (
    // The shape every call site uses: a non-scrolling element carries the class
    // and hosts the button, with the scrolling block beside/below it.
    <div data-testid="row" className={`group/wrap relative ${softWrap.blockClassName}`}>
      {softWrap.button}
      <div data-testid="block" className="monospace-block overflow-x-auto">
        content
      </div>
    </div>
  );
}

const btn = (c: HTMLElement) => c.querySelector<HTMLButtonElement>('button[aria-pressed]')!;
const row = (c: HTMLElement) => c.querySelector<HTMLElement>('[data-testid="row"]')!;

afterEach(() => {
  document.documentElement.classList.remove('soft-wrap');
});

describe('useSoftWrapToggle (#179 follow-up)', () => {
  it('starts opted out when the setting is off', () => {
    const {container} = render(<Host />);
    expect(row(container).classList.contains('soft-wrap-off')).toBe(true);
    expect(btn(container).getAttribute('aria-pressed')).toBe('false');
  });

  it('folds the block when pressed, and unfolds it when pressed again', () => {
    const {container} = render(<Host />);

    act(() => btn(container).click());
    expect(row(container).classList.contains('soft-wrap')).toBe(true);
    expect(btn(container).getAttribute('aria-pressed')).toBe('true');

    act(() => btn(container).click());
    expect(row(container).classList.contains('soft-wrap-off')).toBe(true);
    expect(btn(container).getAttribute('aria-pressed')).toBe('false');
  });

  it('keeps the button out of the element that scrolls', () => {
    // An absolutely positioned child of a scroll container scrolls with the
    // content and slides off screen; the button has to be a sibling.
    const {container} = render(<Host />);
    const block = container.querySelector<HTMLElement>('[data-testid="block"]')!;
    expect(block.contains(btn(container))).toBe(false);
  });

  it('does not swallow the click into the block underneath', () => {
    // The tool blocks expand on click. Without stopPropagation the same click
    // that folds the lines also resizes the box under the pointer.
    let outerClicks = 0;
    function Wrapped() {
      return (
        <div onClick={() => {outerClicks++;}}>
          <Host />
        </div>
      );
    }
    const {container} = render(<Wrapped />);
    act(() => btn(container).click());
    expect(outerClicks).toBe(0);
  });

  it('labels the action rather than the state', () => {
    const {container} = render(<Host />);
    const unfolded = btn(container).getAttribute('aria-label');
    act(() => btn(container).click());
    const folded = btn(container).getAttribute('aria-label');
    expect(unfolded).toBeTruthy();
    expect(folded).toBeTruthy();
    expect(folded).not.toBe(unfolded);
  });

  it('keeps one glyph and lets the chip carry the state', () => {
    // The drawing stays put; `aria-pressed` is what the stylesheet keys the
    // accent fill off (see softWrap.css.test). Swapping the glyph too would
    // make the two states read as two different controls.
    const {container} = render(<Host />);
    const paths = () =>
      Array.from(btn(container).querySelectorAll('path'))
        .map((p) => p.getAttribute('d'))
        .join('|');

    const off = paths();
    act(() => btn(container).click());

    expect(off).toBeTruthy();
    expect(paths()).toBe(off);
    expect(btn(container).getAttribute('aria-pressed')).toBe('true');
  });

  it('wears the same chip as the copy button it sits beside', () => {
    // `.wrap-toggle-button` pulls the copy button's own CSS variables. Without
    // it the glyph floated over the code with no backdrop marking it a control.
    const {container} = render(<Host />);
    expect(btn(container).classList.contains('wrap-toggle-button')).toBe(true);
  });
});
