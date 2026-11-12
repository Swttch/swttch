import { XMarkIcon } from '@heroicons/react/24/outline';
import { Portal } from '@/components/Portal';
import { useEscapeLayer } from '@/hooks/useEscapeLayer';
import { useTranslation } from '@/i18n';

const ITEMS = ['create', 'rename', 'archive', 'delete', 'parent'] as const;
const PREFIX = 'general.sessionManager.announcement.details';

/**
 * What the model can do with sessions once the session manager is installed, and what else comes with it.
 *
 * The card in the empty chat has room for one sentence, so the rest lives in a window of its own. The
 * screens it points at are named with the settings page's own translations, so a reader can find them.
 */
export function SessionManagerNoticeDetails({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation('settings');
  const where = {
    settings: t('layout.title'),
    general: t('nav.general'),
    about: t('nav.about'),
    dependencies: t('about.dependencies.title'),
    manager: t('general.sessionManager.title'),
  };

  useEscapeLayer(() => {
    onClose();
    return true;
  });

  return (
    <Portal>
      <div
        data-testid="session-manager-notice-backdrop"
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-overlay-scrim"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div
          role="dialog"
          aria-label={t(`${PREFIX}.title`)}
          className="relative bg-surface-raised border border-border-default rounded-xl shadow-2xl w-full max-w-md max-h-full overflow-y-auto p-6 flex flex-col gap-4"
        >
          <button
            type="button"
            onClick={onClose}
            aria-label={t(`${PREFIX}.close`)}
            className="absolute right-3 top-3 rounded p-1 text-text-tertiary hover:text-text-primary hover:bg-surface-tooltip transition-colors"
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
          <h2 className="text-md font-semibold text-text-primary pr-6">{t(`${PREFIX}.title`)}</h2>
          <p className="text-sm text-text-secondary">{t(`${PREFIX}.intro`)}</p>
          <ul className="list-disc ps-5 flex flex-col gap-1.5 text-sm text-text-secondary">
            {ITEMS.map((item) => (
              <li key={item}>{t(`${PREFIX}.items.${item}`)}</li>
            ))}
          </ul>
          <p className="text-xs text-text-tertiary">{t(`${PREFIX}.archiveNote`)}</p>
          <p className="text-sm text-text-secondary">{t(`${PREFIX}.mcp`, where)}</p>

          <h3 className="text-sm font-semibold text-text-primary">{t(`${PREFIX}.treeTitle`)}</h3>
          <ul className="list-disc ps-5 flex flex-col gap-1.5 text-sm text-text-secondary">
            <li>{t(`${PREFIX}.treeLevels`)}</li>
            <li>{t(`${PREFIX}.treeRail`)}</li>
          </ul>

          <h3 className="text-sm font-semibold text-text-primary">{t(`${PREFIX}.sponsorTitle`)}</h3>
          <p className="text-sm text-text-secondary">{t(`${PREFIX}.sponsorThanks`)}</p>
          <ul className="list-disc ps-5 flex flex-col gap-1.5 text-sm text-text-secondary">
            <li>{t(`${PREFIX}.sponsorDrag`)}</li>
            <li>{t(`${PREFIX}.sponsorSyncBody`)}</li>
            <li>{t(`${PREFIX}.sponsorWhere`, where)}</li>
          </ul>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-accent-primary-hover hover:bg-accent-primary text-text-primary transition-colors"
            >
              {t(`${PREFIX}.close`)}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
