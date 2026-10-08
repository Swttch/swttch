import { useState, type ReactElement } from 'react';
import { DragDropProvider } from '@dnd-kit/react';
import type { Attachment, PendingUpload } from '../../../../types';
import { isImageAttachment, isFileAttachment, isFolderAttachment } from '../../../../types';
import { ImageLightbox } from '@/components/ImageLightbox';
import { ImagePreview } from './ImagePreview';
import { FileChip } from './FileChip';
import { FolderChip } from './FolderChip';
import { UploadChip } from './UploadChip';
import { FileTile, FolderTile, UploadTile } from './Tiles';
import { SortableChip } from './SortableChip';
import { idsAfterDrag } from './attachmentOrder';

interface Props {
  attachments: Attachment[];
  /** Files and folders still travelling to the backend; drawn after the finished ones. */
  uploads?: PendingUpload[];
  onRemove: (id: string) => void;
  /** Called with the new order, as ids, once a chip has been dragged to a new place. */
  onReorder?: (ids: string[]) => void;
  onCancelUpload?: (id: string) => void;
}

export function AttachmentPreview(props: Props) {
  const { attachments, uploads = [], onRemove, onReorder, onCancelUpload } = props;

  // Held here rather than inside ImagePreview: stepping to the next image needs
  // the whole set, and a single preview only knows itself. This is also what
  // keeps the composer's viewer the same component the transcript opens.
  const [openedIndex, setOpenedIndex] = useState<number | null>(null);

  if (attachments.length === 0 && uploads.length === 0) return null;

  // Only images are reachable from the viewer, so their positions are counted
  // among themselves — a file or folder chip sitting between two images must not
  // shift the index the viewer opens on.
  const images = attachments.filter(isImageAttachment);

  // A thumbnail makes the row as tall as a 64px square. Beside it a one-line pill
  // looks lost, so while any image is in the row the other chips take the same
  // square form; with no image they stay the compact pills.
  const asCards = images.length > 0;

  // One attachment alone has nowhere to move, so it does not invite a drag.
  const sortable = attachments.length > 1 && onReorder !== undefined;

  const chipOf = (att: Attachment): ReactElement | null => {
    if (isImageAttachment(att)) {
      return <ImagePreview attachment={att} onRemove={onRemove} onOpen={() => setOpenedIndex(images.indexOf(att))} />;
    }
    if (isFileAttachment(att)) {
      return asCards
        ? <FileTile attachment={att} onRemove={onRemove} />
        : <FileChip attachment={att} onRemove={onRemove} />;
    }
    if (isFolderAttachment(att)) {
      return asCards
        ? <FolderTile attachment={att} onRemove={onRemove} />
        : <FolderChip attachment={att} onRemove={onRemove} />;
    }
    return null;
  };

  return (
    <>
      <DragDropProvider
        onDragEnd={(event) => {
          const ids = onReorder && idsAfterDrag(attachments, event);
          if (ids) onReorder(ids);
        }}
      >
        {/* items-start: without it the row stretches every chip to the tallest one,
            so a thumbnail makes the file chips beside it grow as tall as the picture. */}
        <div className="flex flex-wrap items-start gap-2 px-3 py-2">
          {attachments.map((att, index) => {
            const chip = chipOf(att);
            return chip && (
              <SortableChip key={att.id} id={att.id} index={index} sortable={sortable}>
                {chip}
              </SortableChip>
            );
          })}
          {onCancelUpload && uploads.map((upload) => (
            asCards
              ? <UploadTile key={upload.id} upload={upload} onCancel={onCancelUpload} />
              : <UploadChip key={upload.id} upload={upload} onCancel={onCancelUpload} />
          ))}
        </div>
      </DragDropProvider>

      {/*
        Scoped to what is still in the composer. These images are not part of the
        conversation yet — they have no transcript entry to point at — so they
        step among themselves and never run on into already-sent attachments.
      */}
      {openedIndex !== null && (
        <ImageLightbox
          srcs={images.map((img) => img.dataUrl)}
          initialIndex={openedIndex}
          onClose={() => setOpenedIndex(null)}
        />
      )}
    </>
  );
}
