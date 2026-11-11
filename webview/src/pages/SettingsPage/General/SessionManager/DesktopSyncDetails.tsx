import { XMarkIcon } from '@heroicons/react/24/outline';
import { Portal } from '@/components/Portal';
import { useEscapeLayer } from '@/hooks/useEscapeLayer';
import { useTranslation } from '@/i18n';

const ITEMS = ['relations', 'archived', 'titles', 'running'] as const;

/**
 * What "Reflect changes from Claude Desktop" does, item by item.
 *
 * A switch that reads another app's records has to say exactly what it reads and what it never does, so the
 * list is in a window of its own rather than squeezed into the row's one line of description.
 */
export function DesktopSyncDetails({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation('settings');

  useEscapeLayer(() => {
    onClose();
    return true;
  });

  return (
    <Portal>
      <div
        data-testid="desktop-sync-details-backdrop"
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-overlay-scrim"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div
          role="dialog"
          aria-label={t('general.sessionManager.desktopSync.details.title')}
          className="relative bg-surface-raised border border-border-default rounded-xl shadow-2xl w-full max-w-md p-6 flex flex-col gap-4"
        >
          <button
            type="button"
            onClick={onClose}
            aria-label={t('general.sessionManager.desktopSync.details.close')}
            className="absolute right-3 top-3 rounded p-1 text-text-tertiary hover:text-text-primary hover:bg-surface-tooltip transition-colors"
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
          <h2 className="text-md font-semibold text-text-primary pr-6">
            {t('general.sessionManager.desktopSync.details.title')}
          </h2>
          <p className="text-sm text-text-secondary">{t('general.sessionManager.desktopSync.details.intro')}</p>
          <ul className="list-disc ps-5 flex flex-col gap-1.5 text-sm text-text-secondary">
            {ITEMS.map((item) => (
              <li key={item}>{t(`general.sessionManager.desktopSync.details.items.${item}`)}</li>
            ))}
          </ul>
          <p className="text-sm text-text-secondary">{t('general.sessionManager.desktopSync.details.yours')}</p>
          <p className="text-xs text-text-tertiary">{t('general.sessionManager.desktopSync.details.needs')}</p>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-accent-primary-hover hover:bg-accent-primary text-text-primary transition-colors"
            >
              {t('general.sessionManager.desktopSync.details.close')}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
