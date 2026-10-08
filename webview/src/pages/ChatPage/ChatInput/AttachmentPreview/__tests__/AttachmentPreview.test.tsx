import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
const { requestMock } = vi.hoisted(() => ({ requestMock: vi.fn() }));
vi.mock('@/api/bridge/Bridge', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/bridge/Bridge')>()),
  getBridge: () => ({ request: requestMock, sendRaw: vi.fn() }),
}));

import { AttachmentPreview } from '../index';
import { _resetFilePreviewCache } from '../loadFilePreview';
import { _resetFileSizeCache } from '../useFileSize';
import { _resetFileIconCache } from '../useFileIcon';
import { MessageType } from '@/shared';
import { ImageAttachment, FileAttachment, FolderAttachment, PendingUpload } from '@/types';

/** A pixel's worth of base64, distinct per image so src comparisons are exact. */
function image(tag: string): ImageAttachment {
  return new ImageAttachment({ fileName: `${tag}.png`, mimeType: 'image/png', base64: tag, size: 3 });
}

function shownSrc(): string | null {
  return screen.getByAltText('Full size').getAttribute('src');
}

/** Only what was asked about a file's content or size; the icon requests are another matter. */
const fileRequests = () => requestMock.mock.calls.filter(([type]) => type === MessageType.GET_FILE_PREVIEW);

beforeEach(() => {
  cleanup();
  requestMock.mockReset();
  requestMock.mockResolvedValue({ kind: 'none' });
  _resetFilePreviewCache();
  _resetFileSizeCache();
  _resetFileIconCache();
});

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

  it('writes the size at the right end of the name line when the chip already knows it', async () => {
    const file = new FileAttachment({ fileName: longName, absolutePath: '/tmp/' + longName, size: 12_737_862 });
    render(<AttachmentPreview attachments={[file]} onRemove={vi.fn()} />);

    fireEvent.mouseEnter(screen.getByText(longName));

    await waitFor(() => expect(screen.getByText('12.7MB')).toBeInTheDocument());
    expect(fileRequests()).toHaveLength(0);
  });

  it('asks the backend for the size of a file picked by path, which carries none', async () => {
    requestMock.mockResolvedValue({ kind: 'none', size: 25_000 });
    const file = new FileAttachment({ fileName: longName, absolutePath: '/tmp/' + longName });
    render(<AttachmentPreview attachments={[file]} onRemove={vi.fn()} />);

    fireEvent.mouseEnter(screen.getByText(longName));

    await waitFor(() => expect(screen.getByText('25KB')).toBeInTheDocument());
    // A pill has no room for a preview, so only the size is asked for.
    expect(requestMock).toHaveBeenCalledWith(expect.any(String), { path: '/tmp/' + longName, metadataOnly: true });
  });

  it('leaves the size out when the backend cannot say', async () => {
    requestMock.mockResolvedValue({ kind: 'none' });
    const file = new FileAttachment({ fileName: longName, absolutePath: '/tmp/gone.mov' });
    render(<AttachmentPreview attachments={[file]} onRemove={vi.fn()} />);

    fireEvent.mouseEnter(screen.getByText(longName));

    await waitFor(() => expect(screen.getAllByText(longName)).toHaveLength(2));
    expect(screen.queryByText(/\d(B|KB|MB|GB)$/)).toBeNull();
  });

  it('tells no size for a folder', async () => {
    const folder = new FolderAttachment({ folderName: 'photos-of-the-trip', absolutePath: '/saved/photos-of-the-trip' });
    render(<AttachmentPreview attachments={[folder]} onRemove={vi.fn()} />);

    fireEvent.mouseEnter(screen.getByText('photos-of-the-trip/'));

    await waitFor(() => expect(screen.getByText('/saved/photos-of-the-trip/')).toBeInTheDocument());
    expect(fileRequests()).toHaveLength(0);
  });

  it('writes the size of an inline image, which is already in hand', async () => {
    const picture = new ImageAttachment({ fileName: 'shot-with-a-long-name.png', mimeType: 'image/png', base64: 'AAA', size: 3_400 });
    render(<AttachmentPreview attachments={[picture]} onRemove={vi.fn()} />);

    fireEvent.mouseEnter(screen.getByText('shot-with-a-long-name.png'));

    await waitFor(() => expect(screen.getByText('3.4KB')).toBeInTheDocument());
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

describe('AttachmentPreview ordering', () => {
  const file = (name: string) => new FileAttachment({ fileName: name, absolutePath: '/tmp/' + name });
  const draggable = (container: HTMLElement) => Array.from(container.querySelectorAll('[data-attachment-id]')) as HTMLElement[];

  it('puts every finished chip in a place that can be picked up, in the order it was attached', () => {
    const a = file('a.md');
    const b = file('b.md');
    const { container } = render(<AttachmentPreview attachments={[a, b]} onRemove={vi.fn()} onReorder={vi.fn()} />);

    expect(draggable(container).map((el) => el.dataset.attachmentId)).toEqual([a.id, b.id]);
  });

  it('invites a drag only when there are two or more to put in order', () => {
    const { container, rerender } = render(<AttachmentPreview attachments={[file('a.md')]} onRemove={vi.fn()} onReorder={vi.fn()} />);
    expect(draggable(container)[0]).not.toHaveClass('cursor-grab');

    rerender(<AttachmentPreview attachments={[file('a.md'), file('b.md')]} onRemove={vi.fn()} onReorder={vi.fn()} />);
    expect(draggable(container)[0]).toHaveClass('cursor-grab');
  });

  it('does not invite a drag when nobody is listening for the new order', () => {
    const { container } = render(<AttachmentPreview attachments={[file('a.md'), file('b.md')]} onRemove={vi.fn()} />);
    expect(draggable(container)[0]).not.toHaveClass('cursor-grab');
  });

  it('keeps a travelling upload out of the order, since it is not an attachment yet', () => {
    const pending = new PendingUpload({ label: 'clip.mov', isFolder: false, totalBytes: 10 });
    const { container } = render(
      <AttachmentPreview
        attachments={[file('a.md'), file('b.md')]}
        uploads={[pending]}
        onRemove={vi.fn()}
        onReorder={vi.fn()}
        onCancelUpload={vi.fn()}
      />,
    );

    expect(draggable(container)).toHaveLength(2);
  });

  it('keeps the browser from starting a picture drag of its own from a thumbnail', () => {
    const { container } = render(<AttachmentPreview attachments={[image('AAA')]} onRemove={vi.fn()} onReorder={vi.fn()} />);
    expect(container.querySelector('img')).toHaveAttribute('draggable', 'false');
  });

  it('still opens an image on a plain click inside its sortable wrapper', () => {
    render(<AttachmentPreview attachments={[image('AAA'), image('BBB')]} onRemove={vi.fn()} onReorder={vi.fn()} />);

    fireEvent.click(screen.getByAltText('BBB.png'));

    expect(screen.getByAltText('Full size').getAttribute('src')).toBe('data:image/png;base64,BBB');
  });

  it('removes a chip from its x without any drag getting in the way', () => {
    const onRemove = vi.fn();
    const a = file('a.md');
    render(<AttachmentPreview attachments={[a, file('b.md')]} onRemove={onRemove} onReorder={vi.fn()} />);

    fireEvent.click(screen.getAllByRole('button')[0]);

    expect(onRemove).toHaveBeenCalledWith(a.id);
  });
});

describe('AttachmentPreview icons', () => {
  const file = (name: string) => new FileAttachment({ fileName: name, absolutePath: '/tmp/' + name });
  const kinds = (container: HTMLElement) =>
    Array.from(container.querySelectorAll('svg[data-kind]')).map((svg) => svg.getAttribute('data-kind'));

  it('gives each compact chip the icon of its own extension, not one icon for all', () => {
    const { container } = render(
      <AttachmentPreview attachments={[file('clip.mov'), file('App.tsx'), file('report.pdf'), file('Makefile')]} onRemove={vi.fn()} />,
    );

    expect(kinds(container)).toEqual(['video', 'code', 'pdf', 'other']);
  });

  it('gives a travelling compact chip its extension icon too', () => {
    const pending = new PendingUpload({ label: 'clip.mov', isFolder: false, totalBytes: 10 });
    const { container } = render(
      <AttachmentPreview attachments={[]} uploads={[pending]} onRemove={vi.fn()} onCancelUpload={vi.fn()} />,
    );

    expect(kinds(container)).toEqual(['video']);
  });

  it('puts the icon at the top left of a card that shows a preview', async () => {
    requestMock.mockResolvedValue({ kind: 'text', text: '# Plan' });
    const { container } = render(<AttachmentPreview attachments={[image('AAA'), file('plan.md')]} onRemove={vi.fn()} />);

    await waitFor(() => expect(screen.getByText(/# Plan/)).toBeInTheDocument());
    const corner = container.querySelector('.top-0\\.5.start-0\\.5');
    expect(corner?.querySelector('svg')?.getAttribute('data-kind')).toBe('text');
  });

  it('draws the big icon of the extension on a card that has no preview', () => {
    const { container } = render(<AttachmentPreview attachments={[image('AAA'), file('data.xlsx')]} onRemove={vi.fn()} />);

    expect(kinds(container)).toEqual(['spreadsheet']);
  });
});

describe('AttachmentPreview file previews', () => {
  const file = (name: string) => new FileAttachment({ fileName: name, absolutePath: '/tmp/' + name });

  it('starts every file card on its icon, before any answer has come', () => {
    requestMock.mockReturnValue(new Promise(() => {}));
    render(<AttachmentPreview attachments={[image('AAA'), file('clip.mov')]} onRemove={vi.fn()} />);

    expect(screen.getByText('MOV')).toBeInTheDocument();
  });

  it('swaps in the first lines of a text file when the backend has them', async () => {
    requestMock.mockResolvedValue({ kind: 'text', text: '# Plan\nstep one' });
    render(<AttachmentPreview attachments={[image('AAA'), file('plan.md')]} onRemove={vi.fn()} />);

    await waitFor(() => expect(screen.getByText(/step one/)).toBeInTheDocument());
    // the extension stays on a corner, so the kind is still readable
    expect(screen.getByText('MD')).toBeInTheDocument();
  });

  it('draws a picture for a file that is one', async () => {
    requestMock.mockResolvedValue({ kind: 'image', mimeType: 'image/svg+xml', base64: 'AAA' });
    const { container } = render(<AttachmentPreview attachments={[image('AAA'), file('logo.svg')]} onRemove={vi.fn()} />);

    await waitFor(() => expect(container.querySelector('img[src="data:image/svg+xml;base64,AAA"]')).not.toBeNull());
  });

  it('keeps the icon when there is nothing to show', async () => {
    render(<AttachmentPreview attachments={[image('AAA'), file('report.pdf')]} onRemove={vi.fn()} />);

    await waitFor(() => expect(fileRequests().length).toBeGreaterThan(0));
    expect(screen.getByText('PDF')).toBeInTheDocument();
    expect(screen.queryByText(/step one/)).toBeNull();
  });

  it('asks about the file by its path, and reads its content only when it is shown as a card', async () => {
    const { rerender } = render(<AttachmentPreview attachments={[file('a.md')]} onRemove={vi.fn()} />);
    // A pill has no room for a preview: it may ask the size, never the content.
    expect(fileRequests().every(([, payload]) => payload.metadataOnly === true)).toBe(true);

    rerender(<AttachmentPreview attachments={[image('AAA'), file('a.md')]} onRemove={vi.fn()} />);
    await waitFor(() => expect(requestMock).toHaveBeenCalledWith(expect.any(String), { path: '/tmp/a.md' }));
  });
});
