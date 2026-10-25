import { useCallback } from 'react';
import { ImageLightbox } from '@/components/ImageLightbox';
import { MoreInSessionNotice, EdgeSponsorHint } from '@/components/ImageLightbox/SponsorGateNotice';
import { useSessionAssetGallery } from '@/hooks/useSessionAssetGallery';
import { openAssetsModal } from '@/pages/ChatPage/SessionHeader/dock/actions';
import { AssetScreenSource, SponsorGate, SponsorGateStep, SponsorGateSurface } from '@/shared';
import { reportSponsorGate } from '@/utils/reportSponsorGate';

interface Props {
  /** The transcript entry the clicked picture belongs to; absent while a turn streams. */
  entryUuid?: string;
  /** The pictures of the clicked block, already decoded in the transcript. */
  localSrcs: string[];
  /** The session-wide key of each of `localSrcs`, for pictures Claude made; attachments are found by `entryUuid`. */
  localKeys?: string[];
  /** Which of `localSrcs` was clicked. */
  openedIndex: number;
  onClose: () => void;
}

/**
 * The viewer a picture in the transcript opens, whichever kind it is: an image
 * you attached, a picture a `Read` returned, a file Claude sent.
 *
 * A sponsor steps with the arrow keys across every picture of the session, the
 * ones they attached and the ones Claude made; anyone else stays inside the
 * clicked block, with the notice that more exists. One component, so the
 * pictures in the transcript cannot drift into viewers that follow different rules.
 */
export function SessionGalleryViewer(props: Props) {
  const { entryUuid, localSrcs, localKeys, openedIndex, onClose } = props;
  const { srcs, initialIndex, lockedCount, onIndexChange, hasMoreInSession } = useSessionAssetGallery({
    entryUuid,
    localSrcs,
    localKeys,
    openedLocalIndex: openedIndex,
  });

  // Close the viewer first: it sits above the Assets screen, so leaving it up
  // would hide the very screen just asked for.
  const showAllAssets = useCallback(() => {
    onClose();
    openAssetsModal(AssetScreenSource.Viewer);
  }, [onClose]);

  return (
    <ImageLightbox
      srcs={srcs}
      initialIndex={initialIndex}
      onClose={onClose}
      onIndexChange={onIndexChange}
      // "Show all" and the panel's grid button are the same request asked two
      // ways, so they run the same code.
      notice={lockedCount > 0 ? <MoreInSessionNotice count={lockedCount} onShowAll={showAllAssets} /> : undefined}
      // Only when something really is out of reach. At the true end of the
      // session there is nothing to explain, and a sponsor line there would be
      // selling something the user already has.
      edgeHint={lockedCount > 0 ? <EdgeSponsorHint from={SponsorGateSurface.Viewer} /> : undefined}
      // The offer counts as shown when the tooltip opens, not when the viewer does.
      onEdgeHintShown={() =>
        reportSponsorGate(SponsorGate.Assets, SponsorGateStep.Seen, {
          from: SponsorGateSurface.Viewer,
          lockedCount,
        })
      }
      onOpenAssets={hasMoreInSession ? showAllAssets : undefined}
    />
  );
}
