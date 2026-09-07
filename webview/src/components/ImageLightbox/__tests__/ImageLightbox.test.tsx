import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ImageLightbox } from '@/components/ImageLightbox';

const SRCS = ['data:image/png;base64,AAA', 'data:image/png;base64,BBB', 'data:image/png;base64,CCC'];

/** The viewer's own image, told apart from any thumbnail by its alt text. */
function shownSrc(): string | null {
  return screen.getByAltText('Full size').getAttribute('src');
}

function press(key: string): void {
  fireEvent.keyDown(window, { key });
}

beforeEach(() => cleanup());

describe('ImageLightbox', () => {
  it('opens on the image that was clicked, not on the first one', () => {
    render(<ImageLightbox srcs={SRCS} initialIndex={2} onClose={vi.fn()} />);

    expect(shownSrc()).toBe(SRCS[2]);
  });

  it('steps to the next and previous image with the arrow keys', () => {
    render(<ImageLightbox srcs={SRCS} initialIndex={0} onClose={vi.fn()} />);

    press('ArrowRight');
    expect(shownSrc()).toBe(SRCS[1]);

    press('ArrowRight');
    expect(shownSrc()).toBe(SRCS[2]);

    press('ArrowLeft');
    expect(shownSrc()).toBe(SRCS[1]);
  });

  it('moves with the up and down keys as well', () => {
    // The list is one dimensional, so the vertical pair has nothing else to
    // mean; pressing it and getting nothing reads as a broken viewer.
    render(<ImageLightbox srcs={SRCS} initialIndex={1} onClose={vi.fn()} />);

    press('ArrowDown');
    expect(shownSrc()).toBe(SRCS[2]);

    press('ArrowUp');
    expect(shownSrc()).toBe(SRCS[1]);
  });

  it('stops at both ends for the vertical keys too', () => {
    render(<ImageLightbox srcs={SRCS} initialIndex={0} onClose={vi.fn()} />);

    press('ArrowUp');
    expect(shownSrc()).toBe(SRCS[0]);

    press('ArrowDown');
    press('ArrowDown');
    press('ArrowDown');
    expect(shownSrc()).toBe(SRCS[2]);
  });

  it('counts a vertical press as a deliberate move, like a horizontal one', () => {
    // Otherwise a late-arriving list would yank the user back after they stepped
    // with the up/down keys but not with left/right.
    const FIVE = [...SRCS, 'data:image/png;base64,DDD', 'data:image/png;base64,EEE'];
    const { rerender } = render(<ImageLightbox srcs={SRCS} initialIndex={0} onClose={vi.fn()} />);

    press('ArrowDown');
    rerender(<ImageLightbox srcs={FIVE} initialIndex={3} onClose={vi.fn()} />);

    expect(shownSrc()).toBe(SRCS[1]);
  });

  it('stops at the last image instead of wrapping to the first', () => {
    // Wrapping would make "am I at the end?" unanswerable, and the end of the
    // list is exactly where the sponsor gate will offer the rest of the session.
    render(<ImageLightbox srcs={SRCS} initialIndex={2} onClose={vi.fn()} />);

    press('ArrowRight');
    press('ArrowRight');

    expect(shownSrc()).toBe(SRCS[2]);
  });

  it('stops at the first image instead of wrapping to the last', () => {
    render(<ImageLightbox srcs={SRCS} initialIndex={0} onClose={vi.fn()} />);

    press('ArrowLeft');
    press('ArrowLeft');

    expect(shownSrc()).toBe(SRCS[0]);
  });

  it('disables the arrow buttons at each end', () => {
    render(<ImageLightbox srcs={SRCS} initialIndex={0} onClose={vi.fn()} />);

    expect(screen.getByLabelText('Previous asset')).toBeDisabled();
    expect(screen.getByLabelText('Next asset')).not.toBeDisabled();

    fireEvent.click(screen.getByLabelText('Next asset'));
    fireEvent.click(screen.getByLabelText('Next asset'));

    expect(screen.getByLabelText('Previous asset')).not.toBeDisabled();
    expect(screen.getByLabelText('Next asset')).toBeDisabled();
  });

  it('shows the position so the user knows how many are left', () => {
    render(<ImageLightbox srcs={SRCS} initialIndex={1} onClose={vi.fn()} />);

    expect(screen.getByText('2 / 3')).toBeInTheDocument();
  });

  it('keeps both arrows for a lone image, disabled rather than absent', () => {
    // The viewer must not look like two different viewers depending on which
    // image opened it. A greyed-out arrow says "not from here"; a missing one
    // says nothing, and the control the user just learned is simply gone.
    render(<ImageLightbox srcs={[SRCS[0]]} initialIndex={0} onClose={vi.fn()} />);

    expect(screen.getByLabelText('Previous asset')).toBeDisabled();
    expect(screen.getByLabelText('Next asset')).toBeDisabled();
  });

  it('shows the counter for a lone asset too, as "1 / 1"', () => {
    // Dropping it made the panel change shape between one asset and two, which
    // reads as a different viewer. "1 / 1" is also the answer to "is there
    // more?", which is the question someone looks down here to settle.
    render(<ImageLightbox srcs={[SRCS[0]]} initialIndex={0} onClose={vi.fn()} />);

    expect(screen.getByText('1 / 1')).toBeInTheDocument();
    expect(screen.getByLabelText('Download asset')).toBeInTheDocument();
  });

  it('offers zoom, copy and download for the image on screen', () => {
    render(<ImageLightbox srcs={SRCS} initialIndex={0} onClose={vi.fn()} />);

    expect(screen.getByLabelText('Zoom in')).toBeInTheDocument();
    expect(screen.getByLabelText('Zoom out')).toBeInTheDocument();
    expect(screen.getByLabelText('Copy asset')).toBeInTheDocument();
    expect(screen.getByLabelText('Download asset')).toBeInTheDocument();
  });

  it('resets zoom when stepping to another image', () => {
    // Magnification chosen for one picture says nothing about the next; arriving
    // mid-zoom would show a crop of an image the user has not seen whole.
    render(<ImageLightbox srcs={SRCS} initialIndex={0} onClose={vi.fn()} />);
    const image = () => screen.getByAltText('Full size');

    fireEvent.click(screen.getByLabelText('Zoom in'));
    expect(image().style.transform).toBe('scale(1.25)');

    press('ArrowRight');

    expect(image().style.transform).toBe('scale(1)');
  });

  it('stops zooming out at the lower bound', () => {
    render(<ImageLightbox srcs={SRCS} initialIndex={0} onClose={vi.fn()} />);

    for (let i = 0; i < 8; i++) fireEvent.click(screen.getByLabelText('Zoom out'));

    expect(screen.getByAltText('Full size').style.transform).toBe('scale(0.5)');
    expect(screen.getByLabelText('Zoom out')).toBeDisabled();
  });

  it('shows the Assets button only when the owner offers one', () => {
    const onOpenAssets = vi.fn();
    const { rerender } = render(<ImageLightbox srcs={SRCS} initialIndex={0} onClose={vi.fn()} />);
    expect(screen.queryByLabelText('View this session’s assets')).toBeNull();

    rerender(
      <ImageLightbox srcs={SRCS} initialIndex={0} onClose={vi.fn()} onOpenAssets={onOpenAssets} />,
    );
    fireEvent.click(screen.getByLabelText('View this session’s assets'));

    expect(onOpenAssets).toHaveBeenCalledTimes(1);
  });

  it('disables the panel actions while the image is still on its way', () => {
    // A pending slot has no bytes to copy, save or open.
    render(<ImageLightbox srcs={[null, SRCS[1]]} initialIndex={0} onClose={vi.fn()} />);

    expect(screen.getByLabelText('Copy asset')).toBeDisabled();
    expect(screen.getByLabelText('Download asset')).toBeDisabled();
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    render(<ImageLightbox srcs={SRCS} initialIndex={0} onClose={onClose} />);

    press('Escape');

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not close when the image itself is clicked', () => {
    const onClose = vi.fn();
    render(<ImageLightbox srcs={SRCS} initialIndex={0} onClose={onClose} />);

    fireEvent.click(screen.getByAltText('Full size'));

    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes exactly once on the close button', () => {
    // The button sits on top of the click-to-dismiss backdrop, so without
    // stopPropagation one press closes the viewer twice.
    const onClose = vi.fn();
    render(<ImageLightbox srcs={SRCS} initialIndex={0} onClose={onClose} />);

    fireEvent.click(screen.getByLabelText('Close'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes when the backdrop around the image is clicked', () => {
    const onClose = vi.fn();
    render(<ImageLightbox srcs={SRCS} initialIndex={0} onClose={onClose} />);

    const backdrop = screen.getByAltText('Full size').closest('div')?.parentElement;
    fireEvent.click(backdrop!);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps arrow clicks from dismissing the viewer', () => {
    const onClose = vi.fn();
    render(<ImageLightbox srcs={SRCS} initialIndex={0} onClose={onClose} />);

    fireEvent.click(screen.getByLabelText('Next asset'));

    expect(onClose).not.toHaveBeenCalled();
    expect(shownSrc()).toBe(SRCS[1]);
  });

  it('opens anyway when the caller passes an out-of-range index', () => {
    render(<ImageLightbox srcs={SRCS} initialIndex={99} onClose={vi.fn()} />);

    expect(shownSrc()).toBe(SRCS[2]);
  });

  it('renders nothing rather than crashing on an empty list', () => {
    const { container } = render(<ImageLightbox srcs={[]} initialIndex={0} onClose={vi.fn()} />);

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByAltText('Full size')).toBeNull();
  });

  it('lands on the clicked image when the fuller list arrives after opening', () => {
    // The session index is fetched when the viewer opens, so the first render
    // gets only this message's images and a position within them. Ignoring the
    // corrected position left the viewer showing a different picture than the
    // one clicked — 3/5 for a click on the 5th (reported 2026-09-07).
    const FIVE = [...SRCS, 'data:image/png;base64,DDD', 'data:image/png;base64,EEE'];
    const { rerender } = render(<ImageLightbox srcs={SRCS} initialIndex={2} onClose={vi.fn()} />);
    expect(screen.getByText('3 / 3')).toBeInTheDocument();

    rerender(<ImageLightbox srcs={FIVE} initialIndex={4} onClose={vi.fn()} />);

    expect(screen.getByText('5 / 5')).toBeInTheDocument();
    expect(shownSrc()).toBe(FIVE[4]);
  });

  it('does not yank the user back if they already moved before the list arrived', () => {
    // A slow fetch must not undo a deliberate step.
    const FIVE = [...SRCS, 'data:image/png;base64,DDD', 'data:image/png;base64,EEE'];
    const { rerender } = render(<ImageLightbox srcs={SRCS} initialIndex={0} onClose={vi.fn()} />);

    press('ArrowRight');
    rerender(<ImageLightbox srcs={FIVE} initialIndex={3} onClose={vi.fn()} />);

    expect(shownSrc()).toBe(SRCS[1]);
  });

  it('pulls back to the last image when the list shrinks under it', () => {
    // The composer lets an attachment be removed while the viewer is open. An
    // index left past the end would render a blank frame.
    const { rerender } = render(<ImageLightbox srcs={SRCS} initialIndex={2} onClose={vi.fn()} />);
    expect(shownSrc()).toBe(SRCS[2]);

    rerender(<ImageLightbox srcs={SRCS.slice(0, 2)} initialIndex={2} onClose={vi.fn()} />);

    expect(shownSrc()).toBe(SRCS[1]);
  });

  it('closes itself when the last image is removed', () => {
    const onClose = vi.fn();
    const { rerender } = render(<ImageLightbox srcs={[SRCS[0]]} initialIndex={0} onClose={onClose} />);

    rerender(<ImageLightbox srcs={[]} initialIndex={0} onClose={onClose} />);

    expect(onClose).toHaveBeenCalled();
  });
});
