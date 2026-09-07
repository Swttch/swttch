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

  return (
      <div className="w-full z-20 border-t border-b border-banner-info-border bg-banner-info-bg px-4 py-1.5 flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <span className="text-text-primary text-[0.8461rem]">
            <strong>{t('updateBanner.released', { version: latestVersion })}</strong>
            {title && <span className="ms-2 text-text-link text-[0.7692rem]">{title}</span>}
          </span>
          {items.length > 0 && (
            <ul className="mt-1 list-disc ps-5 space-y-0.5 text-text-secondary text-[0.7692rem]">
              {items.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ul>
          )}
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
  );
}
