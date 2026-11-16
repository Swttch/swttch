import { SettingRow, ScopeGuard } from '../../common';
import { ToggleSwitch } from '@/components/ToggleSwitch';
import { useSettings } from '@/contexts/SettingsContext';
import { DEFAULT_SETTINGS, SettingKey } from '@/types/settings';
import { useTranslation } from '@/i18n';
import { useIsOverriddenByProject } from '@/utils/settingsScope';

/**
 * Whether the chat lets go of the pages of a long conversation the reader has moved away from (#680).
 * On by default. Off keeps everything loaded, the way the chat worked before, for a reader who finds the
 * pages coming and going unsettling. App-global behaviour, so it is written to global scope.
 */
export function ChatWindowingRow() {
  const isOverridden = useIsOverriddenByProject();
  const { settings, updateSettingWithScope, scope } = useSettings();
  const { t } = useTranslation('settings');

  const enabled = settings[SettingKey.CHAT_WINDOWING] ?? DEFAULT_SETTINGS[SettingKey.CHAT_WINDOWING];

  return (
    <SettingRow
      label={t('general.chatLoading.windowing.label')}
      description={t('general.chatLoading.windowing.description')}
      isOverridden={isOverridden(SettingKey.CHAT_WINDOWING)}
    >
      <ScopeGuard supportedScope="global" currentScope={scope}>
        <ToggleSwitch
          checked={enabled}
          onChange={(checked) => updateSettingWithScope(SettingKey.CHAT_WINDOWING, checked, 'global')}
          ariaLabel={t('general.chatLoading.windowing.label')}
        />
      </ScopeGuard>
    </SettingRow>
  );
}
