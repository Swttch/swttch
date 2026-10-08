import { useEffect } from 'react';
import { SettingRow, ScopeGuard } from '../../common';
import { ToggleSwitch } from '@/components/ToggleSwitch';
import { SettingBadge, SettingBadgeVariant } from '@/components';
import { useAllowAllCommands } from '@/contexts/AllowAllCommandsContext';
import { useSettings } from '@/contexts/SettingsContext';
import { SponsorGate, SponsorGateStep, SponsorGateSurface } from '@/shared';
import { SettingKey } from '@/types/settings';
import { useTranslation } from '@/i18n';
import { followSponsorOffer } from '@/utils/followSponsorOffer';
import { reportSponsorGate } from '@/utils/reportSponsorGate';
import { useIsOverriddenByProject } from '@/utils/settingsScope';

/**
 * Whether every session starts with "Allow all command in this session" on.
 *
 * Sponsor-only. Turning it on goes through the same warning as the session's
 * own switch, because a toggle here would otherwise be a way around reading it;
 * turning it off needs none, since it only brings the approval panel back.
 *
 * For a user who is not a sponsor the switch stays on screen, dimmed and off,
 * and pressing it opens the Sponsor page: a locked option that is hidden would
 * sell nothing, and one that merely refuses would leave a dead end.
 *
 * Written to the user settings only, so the project tab shows it inert: the
 * project file lives in the repository, and honouring a value from there would
 * let a cloned repo switch off the CLI's own risk warnings.
 */
export function AllowAllCommandsRow() {
  const { t } = useTranslation('settings');
  const isOverridden = useIsOverriddenByProject();
  const { scope, scopeSettings } = useSettings();
  const { requestEnableByDefault, disableByDefault, sponsorLocked } = useAllowAllCommands();

  // On screen as soon as the row is, and only where it can be pressed: the
  // project tab shows it inert, which offers nothing.
  const offerVisible = sponsorLocked && scope === 'global';
  useEffect(() => {
    if (!offerVisible) return;
    reportSponsorGate(SponsorGate.AllowAllCommands, SponsorGateStep.Seen, {
      from: SponsorGateSurface.SettingsToggle,
    });
  }, [offerVisible]);

  const checked = (scopeSettings[SettingKey.ALLOW_ALL_COMMANDS_BY_DEFAULT] as boolean | undefined) ?? false;

  return (
    <SettingRow
      label={t('permissions.allowAllCommands.label')}
      description={t('permissions.allowAllCommands.description')}
      isOverridden={isOverridden(SettingKey.ALLOW_ALL_COMMANDS_BY_DEFAULT)}
      badge={<SettingBadge variant={SettingBadgeVariant.Sponsor} />}
    >
      <ScopeGuard supportedScope="global" currentScope={scope}>
        <div className={sponsorLocked ? 'opacity-60' : undefined}>
          <ToggleSwitch
            // A stored value that no longer applies is not shown as on: the
            // switch is inert, and "on" would claim something that is not true.
            checked={checked && !sponsorLocked}
            onChange={async (next) => {
              if (sponsorLocked) {
                followSponsorOffer(SponsorGate.AllowAllCommands, SponsorGateSurface.SettingsToggle);
                return;
              }
              if (next) await requestEnableByDefault();
              else await disableByDefault();
            }}
            ariaLabel={t('permissions.allowAllCommands.label')}
          />
        </div>
      </ScopeGuard>
    </SettingRow>
  );
}
