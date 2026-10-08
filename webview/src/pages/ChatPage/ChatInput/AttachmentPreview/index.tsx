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
import { isPictureName } from './fileType';
import { usePictureSources } from './usePictureSources';

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
  const pictureSources = usePictureSources(attachments);

  if (attachments.length === 0 && uploads.length === 0) return null;

  // A picture is a picture however it got here: pasted or dropped (inline), or a
  // picture file picked or dropped by path. Pictures are what the viewer steps
  // through, in the order of the row.
  const isPicture = (att: Attachment) => isImageAttachment(att) || (isFileAttachment(att) && isPictureName(att.fileName));
  const pictures = attachments.filter(isPicture);

  // What the viewer can show. A picture file whose picture has not arrived, or is
  // too big to send, is left out, and a click on its card does nothing.
  const viewable = pictures.flatMap((att) => {
    const src = isImageAttachment(att) ? att.dataUrl : pictureSources[att.id];
    return src ? [{ id: att.id, src }] : [];
  });
  const openPicture = (id: string) => {
    const index = viewable.findIndex((picture) => picture.id === id);
    if (index !== -1) setOpenedIndex(index);
  };

  // A thumbnail makes the row as tall as a 64px square. Beside it a one-line pill
  // looks lost, so while any picture is in the row the other chips take the same
  // square form; with no picture they stay the compact pills.
  const asCards = pictures.length > 0;

  // One attachment alone has nowhere to move, so it does not invite a drag.
  const sortable = attachments.length > 1 && onReorder !== undefined;

  const chipOf = (att: Attachment): ReactElement | null => {
    if (isImageAttachment(att)) {
      return <ImagePreview attachment={att} onRemove={onRemove} onOpen={() => openPicture(att.id)} />;
    }
    if (isFileAttachment(att)) {
      return asCards
        ? <FileTile attachment={att} onRemove={onRemove} onOpenPicture={() => openPicture(att.id)} />
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
          srcs={viewable.map((picture) => picture.src)}
          initialIndex={openedIndex}
          onClose={() => setOpenedIndex(null)}
        />
      )}
    </>
  );
}
