import React, { useState } from 'react';
import type { ImageBlockDto } from '../../../../dto/message/ContentBlockDto';
import { useTranslation } from '@/i18n';
import { SessionGalleryViewer } from '@/components/SessionGalleryViewer';

interface ImageAttachmentsProps {
  images: ImageBlockDto[];
  /**
   * The transcript entry these images belong to.
   *
   * Absent while a turn is still streaming — the entry is not on disk yet, so
   * the session index cannot point at it and the viewer stays inside the message.
   */
  entryUuid?: string;
}

const getImageSrc = (image: ImageBlockDto): string => {
  if (image.source.type === 'base64') {
    return `data:${image.source.media_type};base64,${image.source.data}`;
  }
  return image.source.data; // URL type
};

export const ImageAttachments: React.FC<ImageAttachmentsProps> = ({ images, entryUuid }) => {
  // The clicked position, not its src: the viewer steps through neighbours, and
  // a src alone cannot say which image comes next.
  const [openedIndex, setOpenedIndex] = useState<number | null>(null);
  const { t } = useTranslation('chatTools');

  const localSrcs = React.useMemo(() => images.map(getImageSrc), [images]);

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {images.map((image, index) => (
          <div
            key={`img-${index}-${image.source.media_type}`}
            className="group relative cursor-pointer"
            onClick={() => setOpenedIndex(index)}
          >
            <div className="overflow-hidden rounded-md border border-border-default bg-surface-hover hover:bg-surface-hover/80 transition-colors">
              <img
                src={getImageSrc(image)}
                alt={t('attachments.imageAlt', { index: index + 1 })}
                className="w-[110px] h-[60px] object-cover"
              />
            </div>
          </div>
        ))}
      </div>

      {openedIndex !== null && (
        <SessionGalleryViewer
          entryUuid={entryUuid}
          localSrcs={localSrcs}
          openedIndex={openedIndex}
          onClose={() => setOpenedIndex(null)}
        />
      )}
    </>
  );
};
