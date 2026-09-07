import React, { useEffect, useRef, useState } from 'react';
import type { ImageBlockDto } from '../../../../dto/message/ContentBlockDto';
import { useTranslation } from '@/i18n';
import { ImageLightbox } from '@/components/ImageLightbox';
import { useSessionAssetGallery } from '@/hooks/useSessionAssetGallery';
import { openSettingsAt } from '@/utils/openSettingsAt';
import { Route } from '@/router';
import { openAssetsModal } from '@/pages/ChatPage/SessionHeader/dock/actions';
import { AssetActivityKind, AssetScreenSource } from '@/shared';
import { reportAssetActivity } from '@/utils/reportAssetActivity';

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

/**
 * The sponsor invitation shown at the end of a non-sponsor's list.
 *
 * States the number out of reach, because "there is more" persuades far less
 * than "there are 24 more". Follows showSponsorGatedToast's tone: an offer, not
 * a wall. Getting to the Assets screen is the panel's job, and that button is
 * there for sponsors too.
 */
const MoreInSessionNotice: React.FC<{ count: number }> = ({ count }) => {
  const { t } = useTranslation('chatTools');
  const { t: tc } = useTranslation('common');

  return (
    <div className="flex items-center gap-3 px-3 py-1.5 rounded-full bg-surface-hover/90 border border-border-default text-text-secondary text-xs">
      <span>{t('attachments.lightbox.moreInSession', { count })}</span>
      <button
        type="button"
        onClick={() => {
          reportAssetActivity(AssetActivityKind.GateClicked);
          void openSettingsAt(Route.SETTINGS_SPONSOR);
        }}
        className="whitespace-nowrap font-medium text-accent-claude transition-opacity hover:opacity-80"
      >
        {tc('sponsorGated.learnMore')}
      </button>
    </div>
  );
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

  /*
    The denominator of this feature's conversion rate: how many people were shown
    that some of the session is out of reach.

    Reported once per opened viewer, not per render. The notice is on screen the
    whole time the viewer is, and `lockedCount` only settles once the session
    index arrives, so counting renders would file the same person dozens of times
    and leave the rate meaningless.
  */
  const gateReported = useRef(false);
  useEffect(() => {
    if (openedIndex === null) {
      gateReported.current = false;
      return;
    }
    if (lockedCount > 0 && !gateReported.current) {
      gateReported.current = true;
      reportAssetActivity(AssetActivityKind.GateSeen, { lockedCount });
    }
  }, [openedIndex, lockedCount]);

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
          notice={lockedCount > 0 ? <MoreInSessionNotice count={lockedCount} /> : undefined}
          onOpenAssets={
            hasMoreInSession
              ? () => {
                  // Close first: the viewer sits above the Assets screen, so
                  // leaving it up would hide the very screen just asked for.
                  setOpenedIndex(null);
                  openAssetsModal(AssetScreenSource.Viewer);
                }
              : undefined
          }
        />
      )}
    </>
  );
};
