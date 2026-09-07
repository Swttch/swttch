import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ImageLightbox } from '../ImageLightbox';

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

    expect(screen.getByLabelText('Previous image')).toBeDisabled();
    expect(screen.getByLabelText('Next image')).not.toBeDisabled();

    fireEvent.click(screen.getByLabelText('Next image'));
    fireEvent.click(screen.getByLabelText('Next image'));

    expect(screen.getByLabelText('Previous image')).not.toBeDisabled();
    expect(screen.getByLabelText('Next image')).toBeDisabled();
  });

  it('shows the position so the user knows how many are left', () => {
    render(<ImageLightbox srcs={SRCS} initialIndex={1} onClose={vi.fn()} />);

    expect(screen.getByText('2 / 3')).toBeInTheDocument();
  });

  it('offers no arrows and no counter for a lone image', () => {
    render(<ImageLightbox srcs={[SRCS[0]]} initialIndex={0} onClose={vi.fn()} />);

    expect(screen.queryByLabelText('Previous image')).toBeNull();
    expect(screen.queryByLabelText('Next image')).toBeNull();
    expect(screen.queryByText('1 / 1')).toBeNull();
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

    fireEvent.click(screen.getByLabelText('Next image'));

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
});
