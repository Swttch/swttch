import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { AttachmentPreview } from '../index';
import { ImageAttachment, FileAttachment } from '@/types';

/** A pixel's worth of base64, distinct per image so src comparisons are exact. */
function image(tag: string): ImageAttachment {
  return new ImageAttachment({ fileName: `${tag}.png`, mimeType: 'image/png', base64: tag, size: 3 });
}

function shownSrc(): string | null {
  return screen.getByAltText('Full size').getAttribute('src');
}

beforeEach(() => cleanup());

describe('AttachmentPreview viewer', () => {
  it('opens the viewer on the thumbnail that was clicked', () => {
    const images = [image('AAA'), image('BBB'), image('CCC')];
    render(<AttachmentPreview attachments={images} onRemove={vi.fn()} />);

    fireEvent.click(screen.getByAltText('CCC.png'));

    expect(shownSrc()).toBe('data:image/png;base64,CCC');
  });

  it('steps between images still in the composer', () => {
    // The point of the report: a composer attachment could be enlarged but not
    // stepped through, while a sent one could.
    render(<AttachmentPreview attachments={[image('AAA'), image('BBB')]} onRemove={vi.fn()} />);

    fireEvent.click(screen.getByAltText('AAA.png'));
    fireEvent.keyDown(window, { key: 'ArrowRight' });

    expect(shownSrc()).toBe('data:image/png;base64,BBB');
  });

  it('counts positions among images only, ignoring file chips in between', () => {
    // Indexing over the mixed attachment list would open the wrong image
    // whenever a file or folder chip sits before it.
    const attachments = [
      image('AAA'),
      new FileAttachment({ fileName: 'notes.txt', absolutePath: '/tmp/notes.txt' }),
      image('BBB'),
    ];
    render(<AttachmentPreview attachments={attachments} onRemove={vi.fn()} />);

    fireEvent.click(screen.getByAltText('BBB.png'));

    expect(shownSrc()).toBe('data:image/png;base64,BBB');
  });

  it('does not step into a file attachment', () => {
    const attachments = [
      image('AAA'),
      new FileAttachment({ fileName: 'notes.txt', absolutePath: '/tmp/notes.txt' }),
    ];
    render(<AttachmentPreview attachments={attachments} onRemove={vi.fn()} />);

    fireEvent.click(screen.getByAltText('AAA.png'));
    fireEvent.keyDown(window, { key: 'ArrowRight' });

    // A lone image offers no navigation at all.
    expect(screen.queryByLabelText('Next image')).toBeNull();
    expect(shownSrc()).toBe('data:image/png;base64,AAA');
  });

  it('shows no viewer until a thumbnail is clicked', () => {
    render(<AttachmentPreview attachments={[image('AAA')]} onRemove={vi.fn()} />);

    expect(screen.queryByAltText('Full size')).toBeNull();
  });

  it('still removes an attachment from its own button', () => {
    const onRemove = vi.fn();
    const img = image('AAA');
    render(<AttachmentPreview attachments={[img]} onRemove={onRemove} />);

    fireEvent.click(screen.getByText('×'));

    expect(onRemove).toHaveBeenCalledWith(img.id);
  });

  it('renders nothing when there is nothing attached', () => {
    const { container } = render(<AttachmentPreview attachments={[]} onRemove={vi.fn()} />);

    expect(container).toBeEmptyDOMElement();
  });
});
