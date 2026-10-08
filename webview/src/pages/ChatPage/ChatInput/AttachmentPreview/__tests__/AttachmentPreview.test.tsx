import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { AttachmentPreview } from '../index';
import { ImageAttachment, FileAttachment, PendingUpload } from '@/types';

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

    // The arrow is present but has nowhere to go: a file attachment is not an
    // image, so it never joins the list the viewer steps through.
    expect(screen.getByLabelText('Next asset')).toBeDisabled();
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

describe('AttachmentPreview uploads', () => {
  const upload = (sent: number, total = 100, label = 'clip.mov', isFolder = false) =>
    new PendingUpload({ label, isFolder, sentBytes: sent, totalBytes: total });

  it('shows a file that is still travelling, with how much of it has gone', () => {
    render(<AttachmentPreview attachments={[]} uploads={[upload(37)]} onRemove={vi.fn()} onCancelUpload={vi.fn()} />);

    expect(screen.getByText('clip.mov')).toBeInTheDocument();
    expect(screen.getByText('37%')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '37');
  });

  it('writes a slash after the name of a folder, as its finished chip does', () => {
    render(<AttachmentPreview attachments={[]} uploads={[upload(0, 0, 'photos', true)]} onRemove={vi.fn()} onCancelUpload={vi.fn()} />);

    expect(screen.getByText('photos/')).toBeInTheDocument();
    // The size is not known while the folder is still being listed.
    expect(screen.queryByText(/%/)).toBeNull();
  });

  it('draws the finished chips first and the travelling ones after them', () => {
    const done = new FileAttachment({ fileName: 'notes.txt', absolutePath: '/tmp/notes.txt' });
    render(<AttachmentPreview attachments={[done]} uploads={[upload(10)]} onRemove={vi.fn()} onCancelUpload={vi.fn()} />);

    const names = [screen.getByText('notes.txt'), screen.getByText('clip.mov')];
    expect(names[0].compareDocumentPosition(names[1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('stops that one upload when its × is pressed', () => {
    const onCancelUpload = vi.fn();
    const pending = upload(10);
    render(<AttachmentPreview attachments={[]} uploads={[pending]} onRemove={vi.fn()} onCancelUpload={onCancelUpload} />);

    fireEvent.click(screen.getByRole('button'));

    expect(onCancelUpload).toHaveBeenCalledWith(pending.id);
  });
});
