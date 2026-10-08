import { SettingSection } from '../common';
import { AllowAllCommandsRow } from './AllowAllCommands';
import { BypassModeRow } from './BypassMode';
import { DefaultModeRow } from './DefaultMode';
import { useTranslation } from '@/i18n';

/**
 * The Permissions page: a heading and one card of rows.
 *
 * A single section rather than one per row. There are only a few settings here,
 * and a heading over each made the page read as separate topics when they are
 * all the same one: how much the user is asked.
 */
export function PermissionsSettings() {
  const { t } = useTranslation('settings');

  return (
    <div>
      <h2 className="text-xl font-semibold text-text-primary mb-6">{t('permissions.heading')}</h2>

      <SettingSection>
        <BypassModeRow />
        <DefaultModeRow />
        <AllowAllCommandsRow />
      </SettingSection>
    </div>
  );
}
