import { describe, it, expect } from 'vitest';
import { dropNeedsIdePath } from '../useAttachments';
import type { DroppedEntry } from '../droppedFiles';

function file(name: string, type: string): DroppedEntry {
  return { file: new File(['x'], name, { type }), isDirectory: false, directory: null };
}

function folder(name: string): DroppedEntry {
  return { file: new File([], name), isDirectory: true, directory: {} as FileSystemDirectoryEntry };
}

// In the IDE a chip for a file or folder needs a path only the IDE can read. A drop that needed one and
// got none ends with nothing on screen, so the chat tells the person (#623). Pictures stay inline and never wait.
describe('dropNeedsIdePath', () => {
  it('needs a path for a file the model does not read inline', () => {
    expect(dropNeedsIdePath([file('notes.txt', 'text/plain')])).toBe(true);
    expect(dropNeedsIdePath([file('contract.pdf', 'application/pdf')])).toBe(true);
  });

  it('needs a path for a file whose type the browser could not name', () => {
    expect(dropNeedsIdePath([file('Makefile', '')])).toBe(true);
  });

  it('needs a path for a folder', () => {
    expect(dropNeedsIdePath([folder('photos')])).toBe(true);
  });

  it('needs none for pictures the model reads inline', () => {
    expect(dropNeedsIdePath([file('a.png', 'image/png'), file('b.jpg', 'image/jpeg')])).toBe(false);
  });

  it('needs a path as soon as one entry among pictures is not a picture', () => {
    expect(dropNeedsIdePath([file('a.png', 'image/png'), file('notes.txt', 'text/plain')])).toBe(true);
  });

  it('needs none when nothing was dropped', () => {
    expect(dropNeedsIdePath([])).toBe(false);
  });
});
