import React, { useCallback, useState } from 'react';
import type { ImageBlockDto } from '../../../../dto/message/ContentBlockDto';
import { useTranslation } from '@/i18n';
import { ImageLightbox } from '@/components/ImageLightbox';
import {
  MoreInSessionNotice,
  EdgeSponsorHint,
} from '@/components/ImageLightbox/SponsorGateNotice';
import { useSessionAssetGallery } from '@/hooks/useSessionAssetGallery';
import { openAssetsModal } from '@/pages/ChatPage/SessionHeader/dock/actions';
import { AssetScreenSource, SponsorGate, SponsorGateStep, SponsorGateSurface } from '@/shared';
import { reportSponsorGate } from '@/utils/reportSponsorGate';

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

  const { srcs, initialIndex, lockedCount, onIndexChange, hasMoreInSession } = useSessionAssetGallery({
    entryUuid,
    localSrcs,
    openedLocalIndex: openedIndex,
  });

  // Close the viewer first: it sits above the Assets screen, so leaving it up
  // would hide the very screen just asked for.
  const showAllAssets = useCallback(() => {
    setOpenedIndex(null);
    openAssetsModal(AssetScreenSource.Viewer);
  }, []);

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
        <ImageLightbox
          srcs={srcs}
          initialIndex={initialIndex}
          onClose={() => setOpenedIndex(null)}
          onIndexChange={onIndexChange}
          // "Show all" and the panel's grid button are the same request asked
          // two ways, so they run the same code.
          notice={
            lockedCount > 0 ? (
              <MoreInSessionNotice count={lockedCount} onShowAll={showAllAssets} />
            ) : undefined
          }
          // Only when something really is out of reach. At the true end of the
          // session there is nothing to explain, and a sponsor line there would
          // be selling something the user already has.
          edgeHint={lockedCount > 0 ? <EdgeSponsorHint from={SponsorGateSurface.Viewer} /> : undefined}
          // The offer counts as shown when the tooltip opens, not when the
          // viewer does: opening a viewer with images out of reach puts someone
          // in the situation the gate exists for, but says nothing about whether
          // they were ever shown a way to buy their way past it.
          onEdgeHintShown={() =>
            reportSponsorGate(SponsorGate.Assets, SponsorGateStep.Seen, {
              from: SponsorGateSurface.Viewer,
              lockedCount,
            })
          }
          onOpenAssets={hasMoreInSession ? showAllAssets : undefined}
        />
      )}
    </>
  );
};
