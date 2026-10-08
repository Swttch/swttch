import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { AttachmentPreview } from '../index';
import { ImageAttachment, FileAttachment, FolderAttachment, PendingUpload } from '@/types';

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

describe('AttachmentPreview layout', () => {
  it('lets each chip keep its own height, so a thumbnail does not fatten the file chips beside it', () => {
    // jsdom has no layout, so the cause is checked instead: a flex row stretches
    // every child to the tallest one unless it aligns its items to the start.
    const attachments = [
      image('AAA'),
      new FileAttachment({ fileName: 'notes.txt', absolutePath: '/tmp/notes.txt' }),
    ];
    render(<AttachmentPreview attachments={attachments} onRemove={vi.fn()} />);

    const row = screen.getByText('notes.txt').closest('.flex-wrap');
    expect(row).toHaveClass('items-start');
  });
});

describe('AttachmentPreview names', () => {
  const longName = 'a-very-long-recording-of-the-whole-afternoon.mov';

  it('shows the whole file name and where it lives when the shortened name is hovered', async () => {
    const file = new FileAttachment({ fileName: longName, absolutePath: '/Users/me/ignore/' + longName });
    render(<AttachmentPreview attachments={[file]} onRemove={vi.fn()} />);

    fireEvent.mouseEnter(screen.getByText(longName));

    await waitFor(() => expect(screen.getAllByText(longName)).toHaveLength(2));
    expect(screen.getByText('/Users/me/ignore/' + longName)).toBeInTheDocument();
  });

  it('shows the whole name of a folder', async () => {
    const folder = new FolderAttachment({ folderName: 'photos-of-the-trip', absolutePath: '/saved/photos-of-the-trip' });
    render(<AttachmentPreview attachments={[folder]} onRemove={vi.fn()} />);

    fireEvent.mouseEnter(screen.getByText('photos-of-the-trip/'));

    await waitFor(() => expect(screen.getByText('/saved/photos-of-the-trip/')).toBeInTheDocument());
  });

  it('shows the whole name under an image thumbnail too, which has no path to add', async () => {
    const picture = new ImageAttachment({ fileName: 'admin-login-2026-10-08T00-00-00Z.png', mimeType: 'image/png', base64: 'AAA', size: 3 });
    render(<AttachmentPreview attachments={[picture]} onRemove={vi.fn()} />);

    fireEvent.mouseEnter(screen.getByText('admin-login-2026-10-08T00-00-00Z.png'));

    await waitFor(() => expect(screen.getAllByText('admin-login-2026-10-08T00-00-00Z.png')).toHaveLength(2));
  });

  it('uses no native title attribute, which the IDE browser never draws', () => {
    const file = new FileAttachment({ fileName: longName, absolutePath: '/tmp/' + longName });
    const folder = new FolderAttachment({ folderName: 'src', absolutePath: '/tmp/src' });
    const { container } = render(<AttachmentPreview attachments={[file, folder]} onRemove={vi.fn()} />);

    expect(container.querySelector('[title]')).toBeNull();
  });
});

describe('AttachmentPreview cards', () => {
  const file = new FileAttachment({ fileName: 'clip.mov', absolutePath: '/tmp/clip.mov' });
  const folder = new FolderAttachment({ folderName: 'photos', absolutePath: '/tmp/photos' });
  const pending = new PendingUpload({ label: 'report.pdf', isFolder: false, sentBytes: 30, totalBytes: 100 });

  it('keeps the compact pills while there is no image in the row', () => {
    render(<AttachmentPreview attachments={[file, folder]} uploads={[pending]} onRemove={vi.fn()} onCancelUpload={vi.fn()} />);

    // A pill carries its × inline; a card's × floats over its corner.
    expect(document.querySelector('.w-16.h-16')).toBeNull();
  });

  it('turns every other chip into a card the size of the thumbnail once an image is in the row', () => {
    render(<AttachmentPreview attachments={[image('AAA'), file, folder]} uploads={[pending]} onRemove={vi.fn()} onCancelUpload={vi.fn()} />);

    // the thumbnail, the file, the folder and the upload
    expect(document.querySelectorAll('.w-16.h-16')).toHaveLength(4);
  });

  it('tags a file card with its extension, so the kind is readable without opening the name', () => {
    render(<AttachmentPreview attachments={[image('AAA'), file]} onRemove={vi.fn()} />);

    expect(screen.getByText('MOV')).toBeInTheDocument();
    expect(screen.getByText('clip.mov')).toBeInTheDocument();
  });

  it('writes the folder name with its slash and no extension tag', () => {
    render(<AttachmentPreview attachments={[image('AAA'), folder]} onRemove={vi.fn()} />);

    expect(screen.getByText('photos/')).toBeInTheDocument();
  });

  it('shows the share uploaded in place of the extension while the file travels', () => {
    render(<AttachmentPreview attachments={[image('AAA')]} uploads={[pending]} onRemove={vi.fn()} onCancelUpload={vi.fn()} />);

    expect(screen.getByText('30%')).toBeInTheDocument();
    expect(screen.queryByText('PDF')).toBeNull();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '30');
  });

  it('removes a card from its corner button', () => {
    const onRemove = vi.fn();
    render(<AttachmentPreview attachments={[image('AAA'), file]} onRemove={onRemove} />);

    fireEvent.click(screen.getAllByRole('button')[1]);

    expect(onRemove).toHaveBeenCalledWith(file.id);
  });

  it('cancels an upload card from its corner button', () => {
    const onCancelUpload = vi.fn();
    render(<AttachmentPreview attachments={[image('AAA')]} uploads={[pending]} onRemove={vi.fn()} onCancelUpload={onCancelUpload} />);

    fireEvent.click(screen.getAllByRole('button')[1]);

    expect(onCancelUpload).toHaveBeenCalledWith(pending.id);
  });
});
