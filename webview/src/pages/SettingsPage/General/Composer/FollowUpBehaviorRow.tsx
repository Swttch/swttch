import { SettingRow } from '../../common';
import { Select, type SelectOption } from '@/components/Select';
import { useSettings } from '@/contexts/SettingsContext';
import { SettingKey } from '@/types/settings';
import {
  FollowUpBehavior,
  resolveFollowUpBehavior,
  type ComposerShortcutSettings,
} from '@/shared';
import { invertKeyLabel } from '@/utils/composerShortcut';
import { APP_NAME } from '@/config/app';
import { useTranslation } from '@/i18n';
import { useIsOverriddenByProject } from '@/utils/settingsScope';

/**
 * What a message typed while a turn is running does.
 *
 * The hint about inverting it for one message is only shown when there is a key
 * to name. That key is derived from the send shortcut, and a send shortcut that
 * already carries every modifier leaves nothing to derive — promising a
 * shortcut we cannot provide would be worse than saying nothing.
 */
export function FollowUpBehaviorRow() {
  const { t } = useTranslation('settings');
  const isOverridden = useIsOverriddenByProject();
  const { scopeSettings, updateSetting } = useSettings();

  const stored = scopeSettings as ComposerShortcutSettings;
  const behavior = resolveFollowUpBehavior(stored);

  // Empty when the send key already carries every modifier, so there is
  // nothing left to add and no one-off invert to promise.
  const invertShortcut = invertKeyLabel(stored);

  const options: SelectOption[] = [
    { value: FollowUpBehavior.Queue, label: t('general.composer.followUp.queue') },
    { value: FollowUpBehavior.Steer, label: t('general.composer.followUp.steer') },
  ];

  return (
    <SettingRow
      label={t('general.composer.followUp.label')}
      description={
        invertShortcut
          ? t('general.composer.followUp.description', {
              appName: APP_NAME,
              shortcut: invertShortcut,
            })
          : t('general.composer.followUp.descriptionNoShortcut', { appName: APP_NAME })
      }
      isOverridden={isOverridden(SettingKey.COMPOSER_FOLLOW_UP_BEHAVIOR)}
    >
      <Select
        value={behavior}
        options={options}
        ariaLabel={t('general.composer.followUp.label')}
        onChange={(value) =>
          void updateSetting(SettingKey.COMPOSER_FOLLOW_UP_BEHAVIOR, value as FollowUpBehavior)
        }
        className="bg-surface-overlay border border-border-default rounded-lg px-3 py-1.5 text-sm text-text-primary"
      />
    </SettingRow>
  );
}
