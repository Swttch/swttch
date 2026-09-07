import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { Portal } from '@/components/Portal';
import { ImageLightbox } from '@/components/ImageLightbox';
import { assetKey, useSessionAssets, useSessionAssetLoader } from '@/hooks/useSessionAssets';
import { useSponsorStatus } from '@/hooks/queries/useSponsorStatus';
import type { SessionAsset } from '@/shared';
import { useTranslation } from '@/i18n';
import { openSettingsAt } from '@/utils/openSettingsAt';
import { Route } from '@/router';
import { AssetThumbnail } from './AssetThumbnail';

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
  const { t: tc } = useTranslation('common');
  const assets = useSessionAssets(true);
  const { loaded, ensure } = useSessionAssetLoader();
  const { isSponsor } = useSponsorStatus();

  const [openedKey, setOpenedKey] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const groups = useMemo(() => groupByMessage(assets ?? []), [assets]);

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
            <h2 className="text-md font-semibold text-text-primary">
              {t('assets.title')}
              {assets && assets.length > 0 && (
                <span className="ms-2 text-xs font-normal text-text-tertiary tabular-nums">
                  {assets.length}
                </span>
              )}
            </h2>
            <button
              onClick={onClose}
              className="w-6 h-6 flex items-center justify-center rounded text-text-tertiary hover:text-text-secondary hover:bg-surface-hover transition-colors"
              aria-label={t('assets.close')}
            >
              <XMarkIcon className="w-4 h-4" />
            </button>
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
              <button
                type="button"
                onClick={() => void openSettingsAt(Route.SETTINGS_SPONSOR)}
                className="font-medium text-accent-claude transition-opacity hover:opacity-80"
              >
                {tc('sponsorGated.learnMore')}
              </button>
            </div>
          )}

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
            {assets && assets.length === 0 && (
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
          </div>
        </div>
      </div>

      {opened && (
        <ImageLightbox
          srcs={scope.map((a) => loaded[assetKey(a)] ?? null)}
          initialIndex={Math.max(scope.findIndex((a) => assetKey(a) === openedKey), 0)}
          onClose={() => setOpenedKey(null)}
          onIndexChange={(i) => {
            const asset = scope[i];
            if (asset) ensure(asset);
          }}
          notice={
            lockedCount > 0 ? (
              <div className="flex items-center gap-3 px-3 py-1.5 rounded-full bg-surface-hover/90 border border-border-default text-text-secondary text-xs">
                <span>{t('assets.moreInSession', { count: lockedCount })}</span>
              </div>
            ) : undefined
          }
        />
      )}
    </Portal>
  );
}
