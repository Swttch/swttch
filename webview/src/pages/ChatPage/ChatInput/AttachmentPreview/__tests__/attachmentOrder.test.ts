import { describe, it, expect } from 'vitest';
import type { DragEndEvent } from '@dnd-kit/react';
import { FileAttachment, FolderAttachment, ImageAttachment } from '@/types';
import { orderAttachmentsBy } from '../../hooks/useAttachments';
import { idsAfterDrag } from '../attachmentOrder';

const image = new ImageAttachment({ fileName: 'a.png', mimeType: 'image/png', base64: 'AAA', size: 3 });
const file = new FileAttachment({ fileName: 'b.md', absolutePath: '/tmp/b.md' });
const folder = new FolderAttachment({ folderName: 'c', absolutePath: '/tmp/c' });
const list = [image, file, folder];

/** What the drag layer reports when a chip is dropped: where it began and where it now sits. */
function dropped(source: { id: string; initialIndex: number; index: number }, targetId: string, canceled = false): DragEndEvent {
  return { operation: { source, target: { id: targetId }, canceled } } as unknown as DragEndEvent;
}

describe('idsAfterDrag', () => {
  it('names the new order when a chip is dropped further along', () => {
    const event = dropped({ id: image.id, initialIndex: 0, index: 2 }, folder.id);
    expect(idsAfterDrag(list, event)).toEqual([file.id, folder.id, image.id]);
  });

  it('names the new order when a chip is dropped earlier', () => {
    const event = dropped({ id: folder.id, initialIndex: 2, index: 0 }, image.id);
    expect(idsAfterDrag(list, event)).toEqual([folder.id, image.id, file.id]);
  });

  it('has nothing to say for a chip dropped where it began', () => {
    expect(idsAfterDrag(list, dropped({ id: file.id, initialIndex: 1, index: 1 }, file.id))).toBeNull();
  });

  it('has nothing to say for a drag that was cancelled', () => {
    expect(idsAfterDrag(list, dropped({ id: image.id, initialIndex: 0, index: 2 }, folder.id, true))).toBeNull();
  });

  it('has nothing to say for a chip dropped outside the row, where there is no target', () => {
    const event = { operation: { source: { id: image.id, initialIndex: 0, index: 0 }, target: null, canceled: false } } as unknown as DragEndEvent;
    expect(idsAfterDrag(list, event)).toBeNull();
  });
});

describe('orderAttachmentsBy', () => {
  it('puts the attachments in the order the ids name', () => {
    expect(orderAttachmentsBy(list, [folder.id, image.id, file.id])).toEqual([folder, image, file]);
  });

  it('keeps an attachment the ids do not name, after the named ones, so a reorder never loses one', () => {
    // a file that landed while a chip was being dragged
    expect(orderAttachmentsBy(list, [folder.id, image.id])).toEqual([folder, image, file]);
  });

  it('ignores an id the list no longer holds, such as a chip removed mid-drag', () => {
    expect(orderAttachmentsBy([image, folder], [folder.id, file.id, image.id])).toEqual([folder, image]);
  });

  it('does not repeat an attachment named twice', () => {
    expect(orderAttachmentsBy(list, [file.id, file.id, image.id, folder.id])).toEqual([file, image, folder]);
  });

  it('leaves the list as it was for an empty order', () => {
    expect(orderAttachmentsBy(list, [])).toEqual(list);
  });
});
