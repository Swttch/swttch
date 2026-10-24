import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isPreviewablePath, openChatFile } from '../openChatFile';
import { filePreviewPaneStore } from '../filePreviewPaneStore';

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
