import { Cog6ToothIcon } from '@heroicons/react/24/outline';
import { Route } from '@/router';
import { openSettingsAt } from '@/utils/openSettingsAt';
import { useTranslation } from '@/i18n';

export function SettingsButton() {
  // Same key the ⋮ menu row uses, so the tooltip and the menu label always read
  // alike. ROUTE_META.label is an untranslated English string, which stood out as
  // the one English tooltip once this icon sat beside the translated dock items.
  const { t } = useTranslation('chat');

  // openSettingsAt applies the user's "Open Settings as" preference (overlay
  // over the running session, or a dedicated tab) — the same helper every other
  // entry point into settings uses, so they cannot drift apart.
  const handleClick = () => {
    void openSettingsAt(Route.SETTINGS_GENERAL);
  };

  return (
    <button
      onClick={handleClick}
      className="p-1 rounded transition-colors text-text-secondary hover:text-text-primary hover:bg-surface-hover"
      title={t('sessionHeader.dock.items.settings')}
    >
      <Cog6ToothIcon className="w-5 h-5" />
    </button>
  );
}
