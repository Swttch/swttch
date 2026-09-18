import { SettingRow } from '../../common';
import { ToggleSwitch } from '@/components/ToggleSwitch';
import { SettingBadge, SettingBadgeVariant } from '@/components';
import { useSettings } from '@/contexts/SettingsContext';
import { SponsorGate, SponsorGateSurface } from '@/shared';
import { ensureSponsor } from '@/utils/ensureSponsor';
import { SettingKey } from '@/types/settings';
import { useTranslation } from '@/i18n';
import { useIsOverriddenByProject } from '@/utils/settingsScope';

/**
 * Whether a session resumes by itself once a usage limit resets.
 *
 * Sponsor-only, and the gate is checked before the write rather than after:
 * flipping the switch and then taking it back would show the setting on for as
 * long as the invite is on screen.
 */
export function AutoResumeOnLimitRow() {
  const { t } = useTranslation('settings');
  const isOverridden = useIsOverriddenByProject();
  const { scopeSettings, updateSetting } = useSettings();

  const autoResumeOnLimit = (scopeSettings.autoResumeOnLimit as boolean | undefined) ?? false;

  return (
    <SettingRow
      label={t('general.autoResumeOnLimit.label')}
      description={t('general.autoResumeOnLimit.description')}
      isOverridden={isOverridden(SettingKey.AUTO_RESUME_ON_LIMIT)}
      badge={<SettingBadge variant={SettingBadgeVariant.Sponsor} />}
    >
      <ToggleSwitch
        checked={autoResumeOnLimit}
        onChange={async (checked) => {
          if (await ensureSponsor(SponsorGate.AutoResume, SponsorGateSurface.SettingsToggle)) {
            updateSetting(SettingKey.AUTO_RESUME_ON_LIMIT, checked);
          }
        }}
        ariaLabel={t('general.autoResumeOnLimit.label')}
      />
    </SettingRow>
  );
}
