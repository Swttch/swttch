import { useSessionContext } from '@/contexts/SessionContext';
import { useTranslation } from '@/i18n';

export function NewTabButton() {
  const { t } = useTranslation('chat');
  const { newTab } = useSessionContext();

  return (
    <button
      id="new-tab-button"
      onClick={newTab}
      className="p-1 rounded transition-colors text-text-secondary hover:text-text-primary hover:bg-surface-hover"
      title={t('sessionHeader.newTab.title')}
    >
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 5v14M5 12h14" />
      </svg>
    </button>
  );
}
