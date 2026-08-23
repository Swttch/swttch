import { SettingRow } from '../common';
import { ToggleSwitch } from '@/components/ToggleSwitch';
import { useSettings } from '@/contexts/SettingsContext';
import { SettingKey } from '@/types/settings';
import { useTranslation } from '@/i18n';
import { useIsOverriddenByProject } from '@/utils/settingsScope';

/**
 * Toggles chat-history paging. On (default): the chat loads the latest page and
 * fetches older messages as you scroll up. Off: the whole conversation loads at
 * once (heavier for long sessions). App-global behaviour → written to global scope.
 */
export function ChatPaginationRow() {
  const isOverridden = useIsOverriddenByProject();
  const { settings, updateSettingWithScope } = useSettings();
  const { t } = useTranslation('settings');

  const enabled = settings[SettingKey.CHAT_PAGINATION] ?? true;

  return (
    <SettingRow
      label={t('general.chatPagination.label')}
      description={t('general.chatPagination.description')}
      isOverridden={isOverridden(SettingKey.CHAT_PAGINATION)}
    >
      <ToggleSwitch
        checked={enabled}
        onChange={(checked) => updateSettingWithScope(SettingKey.CHAT_PAGINATION, checked, 'global')}
        ariaLabel={t('general.chatPagination.label')}
      />
    </SettingRow>
  );
}
