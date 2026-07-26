import { Cog6ToothIcon } from '@heroicons/react/24/outline';
import { Route } from '@/router';
import { ROUTE_META } from '@/router/routes';
import { openSettingsAt } from '@/utils/openSettingsAt';

export function SettingsButton() {
  const settingsMeta = ROUTE_META[Route.SETTINGS];

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
      title={settingsMeta.label}
    >
      <Cog6ToothIcon className="w-5 h-5" />
    </button>
  );
}
