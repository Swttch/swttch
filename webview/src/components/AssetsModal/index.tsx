import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { PhotoIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { Portal } from '@/components/Portal';
import { ImageLightbox } from '@/components/ImageLightbox';
import {
  MoreInSessionNotice,
  EdgeSponsorHint,
  LearnMoreButton,
} from '@/components/ImageLightbox/SponsorGateNotice';
import { assetKey, useSessionAssets, useSessionAssetLoader } from '@/hooks/useSessionAssets';
import { isPictureOutput, outputKey, useSessionOutputImages, useSessionOutputs } from '@/hooks/useSessionOutputs';
import { getAdapter } from '@/adapters';
import { openChatFile } from '@/utils/openChatFile';
import { toolLabel } from '@/utils/toolLabel';
import { useSponsorStatus } from '@/hooks/queries/useSponsorStatus';
import { SponsorGate, SponsorGateStep, SponsorGateSurface, type SessionAsset, type SessionOutput } from '@/shared';
import { reportSponsorGate } from '@/utils/reportSponsorGate';
import { useTranslation } from '@/i18n';
import { useDockLayout } from '@/pages/ChatPage/SessionHeader/dock/useDockLayout';
import { toggleDockVisible } from '@/pages/ChatPage/SessionHeader/dock/toggleDockVisible';
import { DockItemId } from '@/types/settings';
import { AssetThumbnail } from './AssetThumbnail';
import { OutputTile } from './OutputTile';

interface Props {
  onClose: () => void;
}

/** One user message and the images attached to it. */
export interface AssetGroup {
  entryUuid: string;
  timestamp: string | null;
  messagePreview: string;
  assets: SessionAsset[];
}

/**
 * Groups the flat index back into messages.
 *
 * The backend answers one row per image because that is what a coordinate index
 * is; the timeline is laid out per message, so the rows are folded here rather
 * than duplicating message shape on the wire.
 */
export function groupByMessage(assets: SessionAsset[]): AssetGroup[] {
  const groups: AssetGroup[] = [];
  for (const asset of assets) {
    const last = groups[groups.length - 1];
    if (last && last.entryUuid === asset.entryUuid) {
      last.assets.push(asset);
      continue;
    }
    groups.push({
      entryUuid: asset.entryUuid,
      timestamp: asset.timestamp,
      messagePreview: asset.messagePreview,
      assets: [asset],
    });
  }
  return groups;
}

/** One tool result and the outputs it produced. */
export interface OutputGroup {
  entryUuid: string;
  timestamp: string | null;
  outputs: SessionOutput[];
}

/** Folds the flat outputs index back into the entries that produced them. */
export function groupOutputsByEntry(outputs: SessionOutput[]): OutputGroup[] {
  const groups: OutputGroup[] = [];
  for (const output of outputs) {
    const last = groups[groups.length - 1];
    if (last && last.entryUuid === output.entryUuid) {
      last.outputs.push(output);
      continue;
    }
    groups.push({ entryUuid: output.entryUuid, timestamp: output.timestamp, outputs: [output] });
  }
  return groups;
}

function formatTime(timestamp: string | null): string {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString();
}

/**
 * Every image attached in this session, laid out as a timeline of the messages
 * they arrived with.
 *
 * Ordered oldest-first and opened scrolled to the bottom, matching the
 * transcript. Reading the same session in two directions on two screens is the
 * kind of mismatch that makes a user distrust both.
 */
export function AssetsModal(props: Props) {
  const { onClose } = props;
  const { t } = useTranslation('chat');
  const assets = useSessionAssets(true);
  const { loaded, ensure } = useSessionAssetLoader();
  const { isSponsor } = useSponsorStatus();

  const [openedKey, setOpenedKey] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const groups = useMemo(() => groupByMessage(assets ?? []), [assets]);

  // What Claude made: pictures its tools returned, files it sent, pages it published.
  const outputs = useSessionOutputs(true);
  const { loaded: outputsLoaded, ensure: ensureOutput } = useSessionOutputImages();
  const outputGroups = useMemo(() => groupOutputsByEntry(outputs ?? []), [outputs]);
  const [openedOutputKey, setOpenedOutputKey] = useState<string | null>(null);
  const openedOutput = useMemo(
    () => (outputs ?? []).find((o) => outputKey(o) === openedOutputKey) ?? null,
    [outputs, openedOutputKey],
  );
  const outputPictures = useMemo(() => (outputs ?? []).filter(isPictureOutput), [outputs]);
  // The same rule as for attachments: a sponsor steps across the session, anyone else stays inside one entry.
  const outputScope = useMemo(() => {
    if (!openedOutput) return [];
    return isSponsor ? outputPictures : outputPictures.filter((o) => o.entryUuid === openedOutput.entryUuid);
  }, [openedOutput, isSponsor, outputPictures]);
  const outputsLocked = openedOutput && !isSponsor ? outputPictures.length - outputScope.length : 0;
  const openOther = (output: SessionOutput) => {
    if (output.kind === 'artifact') void getAdapter().openUrl(output.url);
    else if (output.kind === 'file') openChatFile(output.path);
  };
  const outputCaption = (group: OutputGroup): string => {
    const first = group.outputs[0];
    if (first.kind === 'image') return toolLabel(first.tool);
    // The tile below already names the page, so the caption names the kind.
    if (first.kind === 'artifact') return t('chatInput.artifacts.fallbackTitle');
    return t('assets.sentFiles');
  };
  const total = (assets?.length ?? 0) + (outputs?.length ?? 0);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Only when the viewer is not up; it owns Escape while open.
      if (e.key === 'Escape' && !openedKey) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, openedKey]);

  // Land on the newest images, the ones a user is most likely looking for.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [groups.length]);

  // What the viewer may step through, following the same rule as the transcript:
  // a sponsor crosses the session, anyone else stays inside the message.
  const opened = useMemo(
    () => (assets ?? []).find((a) => assetKey(a) === openedKey) ?? null,
    [assets, openedKey],
  );
  const scope = useMemo(() => {
    if (!opened) return [];
    return isSponsor ? (assets ?? []) : (assets ?? []).filter((a) => a.entryUuid === opened.entryUuid);
  }, [opened, isSponsor, assets]);

  const lockedCount = opened && !isSponsor ? (assets?.length ?? 0) - scope.length : 0;

  /*
    Counted once per viewer, exactly as the transcript does it. This screen used
    to report nothing at all, which quietly made the funnel unmeasurable from the
    very surface the gate is designed around: someone here has already seen every
    thumbnail, so this is where "saw the gate" means the most.
  */
  // Whether this screen is pulled out into the header dock.
  const { layout, save } = useDockLayout();
  const pinned = layout.visible.includes(DockItemId.ASSETS);
  const togglePinned = useCallback(
    () => save(toggleDockVisible(layout, DockItemId.ASSETS)),
    [layout, save],
  );

  return (
    <Portal>
      <div
        className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-overlay-scrim"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className="w-full max-w-2xl h-[80vh] flex flex-col bg-surface-raised border border-border-default rounded-xl shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-border-default">
            {/* The dock icon, so the row in the dock and this title are visibly
                the same thing — the pin control below only teaches that if the
                user can recognise what it would pin. */}
            <h2 className="flex items-center gap-2 text-md font-semibold text-text-primary">
              {/* Bigger than the em box, not equal to it: an outline glyph
                  leaves padding inside its own square, so an icon sized to the
                  text reads as smaller than the text beside it. */}
              <PhotoIcon className="w-5 h-5 text-text-secondary" />
              {t('assets.title')}
              {total > 0 && (
                <span className="text-xs font-normal text-text-tertiary tabular-nums">
                  {total}
                </span>
              )}
            </h2>

            <div className="flex items-center gap-3">
              {/*
                Teaches that the dock exists, and that this screen can live in
                it. A new dock item is added hidden, so without a control like
                this the dock's only advert is the ⋮ menu nobody opens. Worded as
                the action it performs, not as a state, so it reads the same way
                the "Learn more" beside it does.
              */}
              <button
                type="button"
                onClick={togglePinned}
                className="text-xs font-medium text-accent-claude transition-opacity hover:opacity-80"
              >
                {pinned ? t('assets.unpinFromDock') : t('assets.pinToDock')}
              </button>
              <button
                onClick={onClose}
                className="w-6 h-6 flex items-center justify-center rounded text-text-tertiary hover:text-text-secondary hover:bg-surface-hover transition-colors"
                aria-label={t('assets.close')}
              >
                <XMarkIcon className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/*
            Said once here, quietly, because a non-sponsor who opens this screen
            and closes it without clicking an image would otherwise never learn
            the feature exists — the gate only speaks at the end of a viewer they
            may never open. Phrased as what sponsorship adds, not as a wall: this
            screen and every thumbnail on it are open to everyone.
          */}
          {!isSponsor && (assets?.length ?? 0) > 0 && (
            <div className="flex items-center gap-2 px-4 py-2 border-b border-border-default text-xs text-text-tertiary">
              <span>{t('assets.sponsorHint')}</span>
              {/* The shared button, so this door to the sponsor page is counted
                  like the others. Hand-rolled here, it reported nothing. */}
              <LearnMoreButton from={SponsorGateSurface.AssetsScreen} />
            </div>
          )}

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
            {assets && assets.length === 0 && outputs && outputs.length === 0 && (
              <p className="text-sm text-text-tertiary text-center py-10">{t('assets.empty')}</p>
            )}

            {groups.map((group) => (
              <div key={group.entryUuid} className="space-y-2">
                <div className="flex items-baseline gap-2 min-w-0">
                  <span className="text-[0.6923rem] text-text-tertiary tabular-nums shrink-0">
                    {formatTime(group.timestamp)}
                  </span>
                  {group.messagePreview && (
                    <span className="text-xs text-text-secondary truncate">{group.messagePreview}</span>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {group.assets.map((asset) => (
                    <AssetThumbnail
                      key={assetKey(asset)}
                      src={loaded[assetKey(asset)] ?? null}
                      onNeeded={() => ensure(asset)}
                      onOpen={() => setOpenedKey(assetKey(asset))}
                    />
                  ))}
                </div>
              </div>
            ))}

            {outputGroups.length > 0 && (
              <h3 className="pt-2 text-xs font-medium text-text-secondary">{t('assets.outputsTitle')}</h3>
            )}
            {outputGroups.map((group) => (
              <div key={`${group.entryUuid}:${group.outputs[0].kind}`} className="space-y-2">
                <div className="flex items-baseline gap-2 min-w-0">
                  <span className="text-[0.6923rem] text-text-tertiary tabular-nums shrink-0">
                    {formatTime(group.timestamp)}
                  </span>
                  <span className="text-xs text-text-secondary truncate">{outputCaption(group)}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {group.outputs.map((output) => (
                    <OutputTile
                      key={outputKey(output)}
                      output={output}
                      src={outputsLoaded[outputKey(output)] ?? null}
                      onNeeded={() => ensureOutput(output)}
                      onOpenPicture={() => setOpenedOutputKey(outputKey(output))}
                      onOpenOther={() => openOther(output)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {openedOutput && (
        <ImageLightbox
          srcs={outputScope.map((o) => outputsLoaded[outputKey(o)] ?? null)}
          initialIndex={Math.max(outputScope.findIndex((o) => outputKey(o) === openedOutputKey), 0)}
          onClose={() => setOpenedOutputKey(null)}
          onIndexChange={(i) => {
            const output = outputScope[i];
            if (output) ensureOutput(output);
          }}
          notice={
            outputsLocked > 0 ? (
              <MoreInSessionNotice count={outputsLocked} onShowAll={() => setOpenedOutputKey(null)} />
            ) : undefined
          }
          edgeHint={
            outputsLocked > 0 ? <EdgeSponsorHint from={SponsorGateSurface.AssetsScreen} /> : undefined
          }
          onOpenAssets={() => setOpenedOutputKey(null)}
        />
      )}

      {opened && (
        <ImageLightbox
          srcs={scope.map((a) => loaded[assetKey(a)] ?? null)}
          initialIndex={Math.max(scope.findIndex((a) => assetKey(a) === openedKey), 0)}
          onClose={() => setOpenedKey(null)}
          onIndexChange={(i) => {
            const asset = scope[i];
            if (asset) ensure(asset);
          }}
          // The same notice the transcript shows, from the same component. Built
          // separately, the two drifted: this one lost its link and its report.
          //
          // "Show all" means "back to the grid" from in here, which is what
          // closing the viewer already does — the screen is still behind it.
          notice={
            lockedCount > 0 ? (
              <MoreInSessionNotice count={lockedCount} onShowAll={() => setOpenedKey(null)} />
            ) : undefined
          }
          // Only when something really is out of reach. At the true end of the
          // session there is nothing to explain, and a sponsor line there would
          // be selling something the user already has.
          edgeHint={
            lockedCount > 0 ? <EdgeSponsorHint from={SponsorGateSurface.AssetsScreen} /> : undefined
          }
          onEdgeHintShown={() =>
            reportSponsorGate(SponsorGate.Assets, SponsorGateStep.Seen, {
              from: SponsorGateSurface.AssetsScreen,
              lockedCount,
            })
          }
          // Kept so the bottom panel is the same panel in both places. Opened
          // from here it steps back to the grid, which is where "view this
          // session's assets" already leads.
          onOpenAssets={() => setOpenedKey(null)}
        />
      )}
    </Portal>
  );
}
