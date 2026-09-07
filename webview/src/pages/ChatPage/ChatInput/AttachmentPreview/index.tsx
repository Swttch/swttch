import { useState } from 'react';
import type { Attachment } from '../../../../types';
import { isImageAttachment, isFileAttachment, isFolderAttachment } from '../../../../types';
import { ImageLightbox } from '@/components/ImageLightbox';
import { ImagePreview } from './ImagePreview';
import { FileChip } from './FileChip';
import { FolderChip } from './FolderChip';

interface Props {
  attachments: Attachment[];
  onRemove: (id: string) => void;
}

export function AttachmentPreview(props: Props) {
  const { attachments, onRemove } = props;

  // Held here rather than inside ImagePreview: stepping to the next image needs
  // the whole set, and a single preview only knows itself. This is also what
  // keeps the composer's viewer the same component the transcript opens.
  const [openedIndex, setOpenedIndex] = useState<number | null>(null);

  if (attachments.length === 0) return null;

  // Only images are reachable from the viewer, so their positions are counted
  // among themselves — a file or folder chip sitting between two images must not
  // shift the index the viewer opens on.
  const images = attachments.filter(isImageAttachment);

  return (
    <>
      <div className="flex flex-wrap gap-2 px-3 py-2">
        {attachments.map((att) => {
          if (isImageAttachment(att)) {
            return (
              <ImagePreview
                key={att.id}
                attachment={att}
                onRemove={onRemove}
                onOpen={() => setOpenedIndex(images.indexOf(att))}
              />
            );
          }
          if (isFileAttachment(att)) {
            return <FileChip key={att.id} attachment={att} onRemove={onRemove} />;
          }
          if (isFolderAttachment(att)) {
            return <FolderChip key={att.id} attachment={att} onRemove={onRemove} />;
          }
          return null;
        })}
      </div>

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
