import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isPreviewablePath, isSentFileViewable, openChatFile, openSentFile } from '../openChatFile';
import { filePreviewPaneStore } from '../filePreviewPaneStore';

const { success } = vi.hoisted(() => ({ success: vi.fn() }));
vi.mock('react-hot-toast', () => ({ default: { success } }));
const openFile = vi.fn(() => Promise.resolve());
vi.mock('@/adapters', () => ({ getAdapter: () => ({ openFile }) }));

beforeEach(() => {
  openFile.mockClear();
  filePreviewPaneStore.close();
});

describe('isPreviewablePath', () => {
  it.each([
    '/p/page.html', '/p/PAGE.HTM', 'C:\\p\\doc.pdf', '/p/shot.png', '/p/a.JPG', '/p/i.svg', '/p/v.mp4', '/p/v.mov', '/p/v.webm',
  ])('%s is shown in the pane', (path) => {
    expect(isPreviewablePath(path)).toBe(true);
  });

  it.each(['/p/main.ts', '/p/notes.txt', '/p/Makefile', '/p/.html', '/p/dir.html/', '/p/photo.heic', '/p/archive.pdf.zip'])(
    '%s stays with the editor',
    (path) => {
      expect(isPreviewablePath(path)).toBe(false);
    },
  );
});

describe('openChatFile', () => {
  it('opens a page in the pane, not the editor', async () => {
    await openChatFile('/p/page.html');
    expect(filePreviewPaneStore.get()).toEqual({ path: '/p/page.html' });
    expect(openFile).not.toHaveBeenCalled();
  });

  it('opens a source file in the editor, and leaves the pane alone', async () => {
    await openChatFile('/p/main.ts', 12, 3);
    expect(openFile).toHaveBeenCalledWith('/p/main.ts', 12, 3);
    expect(filePreviewPaneStore.get()).toBeNull();
  });

  it('sends a click that names a line to the editor even for a page', async () => {
    await openChatFile('/p/page.html', 40);
    expect(openFile).toHaveBeenCalledWith('/p/page.html', 40);
    expect(filePreviewPaneStore.get()).toBeNull();
  });
});

describe('a file Claude handed over', () => {
  it.each(['/p/page.html', '/p/a.csv', '/p/n.md', '/p/c.json', '/p/m.PY', '/p/x.mmd'])('%s opens in the pane', (path) => {
    expect(isSentFileViewable(path)).toBe(true);
  });

  it.each(['/p/a.docx', '/p/b.xlsx', '/p/c.pptx', '/p/d.zip', '/p/Makefile'])('%s does not', (path) => {
    expect(isSentFileViewable(path)).toBe(false);
  });

  it('shows text in the pane, while a path named in the chat still goes to the editor', async () => {
    await openSentFile('/p/data.csv');
    expect(filePreviewPaneStore.get()).toEqual({ path: '/p/data.csv' });
    expect(openFile).not.toHaveBeenCalled();

    filePreviewPaneStore.close();
    await openChatFile('/p/main.ts');
    expect(filePreviewPaneStore.get()).toBeNull();
    expect(openFile).toHaveBeenCalled();
  });

  it('sends what the pane cannot show to the editor, as any path', async () => {
    await openSentFile('/p/deck.pptx');
    expect(filePreviewPaneStore.get()).toBeNull();
    expect(openFile).toHaveBeenCalledWith('/p/deck.pptx');
    // Said on screen, so the click does not read as having done nothing.
    expect(success).toHaveBeenCalledTimes(1);
  });
});
