import { describe, it, expect } from 'vitest';
import { FolderAttachment, PendingUpload } from '../attachment';

describe('FolderAttachment', () => {
  describe('absolutePath normalization', () => {
    it('preserves a path already ending with forward slash', () => {
      const att = new FolderAttachment({ folderName: 'src', absolutePath: '/home/user/src/' });
      expect(att.absolutePath).toBe('/home/user/src/');
    });

    it('appends forward slash to a unix path with no trailing separator', () => {
      const att = new FolderAttachment({ folderName: 'src', absolutePath: '/home/user/src' });
      expect(att.absolutePath).toBe('/home/user/src/');
    });

    it('preserves a path already ending with backslash (Windows)', () => {
      const att = new FolderAttachment({
        folderName: 'src',
        absolutePath: 'C:\\Users\\proj\\src\\',
      });
      // Must end with the same backslash — no mixed separator added
      expect(att.absolutePath).toBe('C:\\Users\\proj\\src\\');
    });

    it('appends backslash to a Windows path with no trailing separator, no mixed separator', () => {
      const att = new FolderAttachment({
        folderName: 'src',
        absolutePath: 'C:\\Users\\proj\\src',
      });
      // Must not produce C:\Users\proj\src/ (mixed)
      expect(att.absolutePath).not.toMatch(/\\\/$/);
      expect(att.absolutePath).not.toMatch(/\/\\$/);
      // Path should end with a separator (either / or \)
      expect(att.absolutePath).toMatch(/[/\\]$/);
    });

    it('does not produce mixed separators for a Windows path', () => {
      const att = new FolderAttachment({
        folderName: 'src',
        absolutePath: 'C:\\Users\\proj\\src',
      });
      // The result must not be "C:\Users\proj\src/" (backslash body + forward slash tail)
      expect(att.absolutePath).not.toBe('C:\\Users\\proj\\src/');
    });

    it('normalizes a mixed-separator Windows path consistently', () => {
      // Edge case: someone passes an already-mixed path
      const att = new FolderAttachment({
        folderName: 'src',
        absolutePath: 'C:\\Users/proj\\src',
      });
      // Must end with exactly one separator and not append a second one if already present
      expect(att.absolutePath).toMatch(/[/\\]$/);
      // Must not end with two separators
      expect(att.absolutePath).not.toMatch(/[/\\]{2}$/);
    });

    it('stores folderName unchanged', () => {
      const att = new FolderAttachment({
        folderName: 'my-folder',
        absolutePath: '/some/path',
      });
      expect(att.folderName).toBe('my-folder');
    });
  });
});

describe('PendingUpload', () => {
  it('reports the whole percent already sent', () => {
    const upload = new PendingUpload({ label: 'clip.mov', isFolder: false, totalBytes: 200 });
    expect(upload.withProgress(0, 200).percent).toBe(0);
    expect(upload.withProgress(99, 200).percent).toBe(49);
    expect(upload.withProgress(200, 200).percent).toBe(100);
  });

  it('has no percent while there is no size to measure against', () => {
    // A folder is listed before its size is known, and an empty file has none.
    expect(new PendingUpload({ label: 'photos', isFolder: true }).percent).toBeNull();
    expect(new PendingUpload({ label: 'empty.txt', isFolder: false, totalBytes: 0 }).percent).toBeNull();
  });

  it('keeps its identity while progress moves, so the chip stays the same chip', () => {
    const upload = new PendingUpload({ label: 'clip.mov', isFolder: false, totalBytes: 10 });
    const moved = upload.withProgress(5, 10);
    expect(moved.id).toBe(upload.id);
    expect(moved.label).toBe('clip.mov');
    expect(upload.sentBytes).toBe(0);
  });
});
