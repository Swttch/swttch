import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { MessageBox } from '../MessageBox';
import { ScrollFoldContext } from '../../../ScrollFoldContext';
import { FOLD_MIN_HEIGHT, FOLD_MAX_HEIGHT } from '../../../useScrollFold';

/** `fold = null` is the at-rest case: the send is not pinned. */
function renderBox(fold: number | null, restingHeight = FOLD_MAX_HEIGHT) {
  const r = render(
    <ScrollFoldContext.Provider value={fold === null ? null : { height: fold, restingHeight }}>
      <MessageBox>body</MessageBox>
    </ScrollFoldContext.Provider>,
  );
  const box = r.container.querySelector('.bg-surface-hover') as HTMLElement;
  return { ...r, box };
}

describe('MessageBox — where the scroll fold meets expand', () => {
  it('sizes itself normally while the send is at rest', () => {
    const { box } = renderBox(null);
    expect(box.style.height).toBe('');
    expect(box.className).toContain('max-h-[280px]');
  });

  it('takes its height from the fold while pinned', () => {
    const { box } = renderBox(180);
    expect(box.style.height).toBe('180px');
  });

  it('floors the fold at one line at the point of use', () => {
    // useScrollFold hands over a negative number on purpose; the clamp lives
    // here so the overshoot survives to drive unfolding.
    const { box } = renderBox(-500);
    expect(box.style.height).toBe(`${FOLD_MIN_HEIGHT}px`);
  });

  it('never draws the bubble taller than it was to begin with', () => {
    // Scrolling backwards past the origin drives the raw height above the
    // resting one. Unbounded, a one-line send was drawn at 448px — a tall
    // empty box. Tall sends hid this: max-h-[280px] capped them anyway.
    const { box } = renderBox(448, 31);
    expect(box.style.height).toBe('31px');
  });

  it('leaves a one-line send at one line rather than padding it to the floor', () => {
    // The floor is a few pixels taller than one line on purpose, so a folded
    // send shows a sliver of its second line and cannot be mistaken for a send
    // that was only ever one line. That signal only works if genuinely short
    // sends are NOT padded up to it — the resting height caps them first.
    const oneLine = 30;
    expect(oneLine).toBeLessThan(FOLD_MIN_HEIGHT);

    const { box } = renderBox(-500, oneLine);
    expect(box.style.height).toBe(`${oneLine}px`);
  });

  it('folds a short send from its own height, not from the 280 cap', () => {
    const { box } = renderBox(20, 44);
    expect(box.style.height).toBe(`${FOLD_MIN_HEIGHT}px`);

    const taller = renderBox(40, 44);
    expect(taller.box.style.height).toBe('40px');
  });

  it('lets expand overrule the fold — "show me this" beats "you scrolled past"', () => {
    const { box } = renderBox(-500);
    fireEvent.click(box);

    expect(box.style.height).toBe('');
    expect(box.className).toContain('max-h-[80vh]');
  });

  it('caps an expanded box at 80vh and scrolls inside it', () => {
    // A pinned send cannot be read by scrolling the page, so a long one has to
    // be readable inside the bubble — and it must not bury the reply entirely.
    const { box } = renderBox(200);
    fireEvent.click(box);

    expect(box.className).toContain('max-h-[80vh]');
    expect(box.className).toContain('overflow-y-auto');
    expect(box.className).toContain('overscroll-contain');
    expect(box.className).not.toContain('max-h-[280px]');
  });

  it('returns to the fold as it stands now, not as it stood when expanded', () => {
    // The fold keeps counting while expand is on. Collapsing lands on the
    // current value — this is why the fold is computed per frame rather than
    // captured into state. Expanding at 200 and collapsing after the fold has
    // moved to 60 must land on 60.
    const { rerender, container } = render(
      <ScrollFoldContext.Provider value={{ height: 200, restingHeight: FOLD_MAX_HEIGHT }}>
        <MessageBox>body</MessageBox>
      </ScrollFoldContext.Provider>,
    );
    const box = container.querySelector('.bg-surface-hover') as HTMLElement;
    expect(box.style.height).toBe('200px');

    fireEvent.click(box);
    expect(box.style.height).toBe('');

    // Scrolled on while expanded — same component instance, new fold value.
    rerender(
      <ScrollFoldContext.Provider value={{ height: 60, restingHeight: FOLD_MAX_HEIGHT }}>
        <MessageBox>body</MessageBox>
      </ScrollFoldContext.Provider>,
    );
    expect(box.style.height).toBe('');

    fireEvent.click(box);
    expect(box.style.height).toBe('60px');
  });

  it('shrinks itself and lets the header make up the difference', () => {
    // Nothing here holds the space the fold gives up. A sticky element keeps
    // its place in the flow, so a box that shrinks in place would drag the
    // transcript up behind it — StickySendHeader adds a spacer outside itself
    // instead, which is what keeps the empty part off the screen.
    const { container } = render(
      <ScrollFoldContext.Provider value={{ height: 200, restingHeight: FOLD_MAX_HEIGHT }}>
        <MessageBox>body</MessageBox>
      </ScrollFoldContext.Provider>,
    );
    const box = container.querySelector('.bg-surface-hover') as HTMLElement;

    expect(box.style.height).toBe('200px');
    expect(container.firstElementChild).toBe(box);
  });

  it('keeps the same DOM node across an expand toggle', () => {
    // Wrapping the box conditionally would change the shape of the tree, and
    // React rebuilds it when that happens — throwing away its scroll position,
    // and the caret of anything focused inside, on every click.
    const { container } = render(
      <ScrollFoldContext.Provider value={{ height: 200, restingHeight: FOLD_MAX_HEIGHT }}>
        <MessageBox>body</MessageBox>
      </ScrollFoldContext.Provider>,
    );
    const before = container.querySelector('.bg-surface-hover') as HTMLElement;

    fireEvent.click(before);
    const after = container.querySelector('.bg-surface-hover') as HTMLElement;

    expect(after).toBe(before);
  });

  it('leaves a non-collapsible box alone entirely', () => {
    const { container } = render(
      <ScrollFoldContext.Provider value={{ height: 100, restingHeight: FOLD_MAX_HEIGHT }}>
        <MessageBox collapsible={false}>body</MessageBox>
      </ScrollFoldContext.Provider>,
    );
    const box = container.querySelector('.bg-surface-hover') as HTMLElement;

    expect(box.style.height).toBe('');
    expect(box.className).not.toContain('max-h-');
  });
});
