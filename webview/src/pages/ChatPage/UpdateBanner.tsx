import { useUpdateAvailable } from '@/hooks/useUpdateAvailable';
import { useBridgeContext } from '@/contexts/BridgeContext';
import { isBrowser } from '@/config/environment';
import { MessageType } from '@/shared';
import { useTranslation } from '@/i18n';
import { parseLatestReleaseNotes } from './parseReleaseNotes';

export function UpdateBanner() {
  const { hasUpdate, latestVersion, latestNotes, requiresRestart, skip } = useUpdateAvailable();
  const { send } = useBridgeContext();
  const { t } = useTranslation('chat');

  if (!hasUpdate || !latestVersion) return null;

  const handleUpdate = () => {
    send(MessageType.UPDATE_PLUGIN, {});
  };

  // The marketplace changelog concatenates several releases; only the newest
  // section belongs in this banner (see parseReleaseNotes.ts).
  const { title, items } = parseLatestReleaseNotes(latestNotes, latestVersion);
  const showActions = !isBrowser();
  const hasItems = items.length > 0;

  return (
      /* `relative` anchors the hover drawer below; `z-30` lifts this banner (and
         therefore the drawer) above the sibling banners that follow it in the
         BannerArea stack, which are z-20 and would otherwise paint over it. */
      <div className={`group relative w-full z-30 border-t ${hasItems ? '' : 'border-b'} border-banner-info-border bg-banner-info-bg`}>
        <div className="px-4 py-1.5 flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <span className="text-text-primary text-[0.8461rem]">
              <strong>{t('updateBanner.released', { version: latestVersion })}</strong>
              {title && <span className="ms-2 text-text-link text-[0.7692rem]">{title}</span>}
            </span>
          </div>

          {showActions && (
            <div className="ms-auto flex items-center gap-2 flex-shrink-0">
              {requiresRestart && <span className="ms-2 text-text-link text-[0.7692rem]">{t('updateBanner.restartRequired')}</span>}
              <button
                  onClick={handleUpdate}
                  className="px-3 py-1 rounded text-[0.7692rem] font-medium bg-surface-base text-text-link hover:bg-state-info-bg transition-colors"
              >
                {t('updateBanner.update')}
              </button>
              <button
                  onClick={skip}
                  className="px-3 py-1 rounded text-[0.7692rem] font-medium text-text-link hover:text-text-primary hover:bg-accent-primary transition-colors"
              >
                {t('updateBanner.skip')}
              </button>
            </div>
          )}
        </div>

        {hasItems && (
          /* Hover drawer. It hangs outside the banner's own box (absolute) so
             the BannerArea ResizeObserver keeps measuring the collapsed title
             row only: letting the banner itself grow would push the entire chat
             down on every hover. Animating a 0fr -> 1fr grid row expands to the
             content's natural height, which max-height cannot do without
             hard-coding a number the list would eventually outgrow. */
          <div className="absolute top-full start-0 w-full grid grid-rows-[0fr] transition-[grid-template-rows] duration-200 ease-out group-hover:grid-rows-[1fr] group-focus-within:grid-rows-[1fr] border-b border-banner-info-border bg-banner-info-bg">
            <div className="overflow-hidden">
              <ul className="list-disc ps-9 pe-4 pt-0.5 pb-2 space-y-0.5 text-text-secondary text-[0.7692rem]">
                {items.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
  );
}
