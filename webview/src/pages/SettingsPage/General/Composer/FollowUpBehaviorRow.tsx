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
import { useDisplaySettings, useIsOverriddenByProject } from '@/utils/settingsScope';

/** The value standing for "this project says nothing; follow the global one". */
const NOT_SET_VALUE = '__NOT_SET__';

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
  const { updateSetting, scope, resetToGlobal } = useSettings();
  const { displaySettings, isInherited, resetFor } = useDisplaySettings();

  const stored = displaySettings as ComposerShortcutSettings;
  const behavior = resolveFollowUpBehavior(stored);

  // Empty when the send key already carries every modifier, so there is
  // nothing left to add and no one-off invert to promise.
  const invertShortcut = invertKeyLabel(stored);

  // "Not set" is how a project takes its own value back, so it is offered only
  // while there is one to take back. Without it a project stays pinned to a
  // choice made once.
  const hasOwnValue = scope === 'project' && !isInherited(SettingKey.COMPOSER_FOLLOW_UP_BEHAVIOR);

  const options: SelectOption[] = [
    ...(hasOwnValue
      ? [{ value: NOT_SET_VALUE, label: t('general.composer.followUp.notSet'), italic: true }]
      : []),
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
      isInherited={isInherited(SettingKey.COMPOSER_FOLLOW_UP_BEHAVIOR)}
      onResetToGlobal={resetFor(SettingKey.COMPOSER_FOLLOW_UP_BEHAVIOR)}
    >
      <Select
        value={behavior}
        options={options}
        ariaLabel={t('general.composer.followUp.label')}
        onChange={(value) => {
          if (value === NOT_SET_VALUE) {
            void resetToGlobal(SettingKey.COMPOSER_FOLLOW_UP_BEHAVIOR);
            return;
          }
          void updateSetting(SettingKey.COMPOSER_FOLLOW_UP_BEHAVIOR, value as FollowUpBehavior);
        }}
        className="bg-surface-overlay border border-border-default rounded-lg px-3 py-1.5 text-sm text-text-primary"
      />
    </SettingRow>
  );
}
