import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ImageAttachments } from '../ImageAttachments';
import type { ImageBlockDto } from '../../../../../dto/message/ContentBlockDto';

/** Minimal stand-in for the wire shape; only `source` is read for rendering. */
function image(data: string): ImageBlockDto {
  return { source: { type: 'base64', media_type: 'image/png', data } } as ImageBlockDto;
}

const IMAGES = [image('AAA'), image('BBB'), image('CCC')];

beforeEach(() => cleanup());

describe('ImageAttachments', () => {
  it('renders one thumbnail per attached image', () => {
    render(<ImageAttachments images={IMAGES} />);

    expect(screen.getAllByAltText(/^Image \d+$/)).toHaveLength(3);
  });

  it('opens the viewer on the thumbnail that was clicked, not the first one', () => {
    // The component used to hold the clicked src, which cannot say what comes
    // next; this is the behaviour that regressed if it goes back to a src.
    render(<ImageAttachments images={IMAGES} />);

    fireEvent.click(screen.getByAltText('Image 3'));

    expect(screen.getByAltText('Full size').getAttribute('src')).toBe(
      'data:image/png;base64,CCC',
    );
  });

  it('lets the arrow keys reach the other images in the same message', () => {
    render(<ImageAttachments images={IMAGES} />);

    fireEvent.click(screen.getByAltText('Image 1'));
    fireEvent.keyDown(window, { key: 'ArrowRight' });

    expect(screen.getByAltText('Full size').getAttribute('src')).toBe(
      'data:image/png;base64,BBB',
    );
  });

  it('shows no viewer until a thumbnail is clicked', () => {
    render(<ImageAttachments images={IMAGES} />);

    expect(screen.queryByAltText('Full size')).toBeNull();
  });

  it('closes the viewer and returns to the thumbnails', () => {
    render(<ImageAttachments images={IMAGES} />);

    fireEvent.click(screen.getByAltText('Image 2'));
    expect(screen.getByAltText('Full size')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(screen.queryByAltText('Full size')).toBeNull();
    expect(screen.getAllByAltText(/^Image \d+$/)).toHaveLength(3);
  });
});
