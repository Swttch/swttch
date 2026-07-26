import { SettingSection, SettingRow } from '../common';
import { Select, type SelectOption } from '@/components/Select';
import { ToggleSwitch } from '@/components/ToggleSwitch';
import { useClaudeSettings } from '@/contexts/ClaudeSettingsContext';
import { SettingBadge, SettingBadgeVariant } from '@/components';
import { type InputMode, INPUT_MODES, getAvailableModes, CLI_FLAG_TO_INPUT_MODE, INPUT_MODE_TO_CLI_FLAG } from '@/types/chatInput';
import type { PermissionsConfig } from '@/types/claude-settings';
import { useTranslation } from '@/i18n';

const NOT_SET_VALUE = '__NOT_SET__';

export function PermissionsSettings() {
  const { t } = useTranslation('settings');
  const { settings, scopeSettings, updateSetting, scope } = useClaudeSettings();

  const permissions = (scopeSettings.permissions ?? {}) as PermissionsConfig;
  const mergedPermissions = (settings.permissions ?? {}) as PermissionsConfig;

  const bypassDisabled = permissions.disableBypassPermissionsMode === 'disable';
  const isBypassNotSet = permissions.disableBypassPermissionsMode === undefined && scope === 'project';

  const rawDefaultMode = permissions.defaultMode;
  const isDefaultModeNotSet = rawDefaultMode === undefined && scope === 'project';
  const defaultModeValue = isDefaultModeNotSet
    ? NOT_SET_VALUE
    : (rawDefaultMode ? (CLI_FLAG_TO_INPUT_MODE[rawDefaultMode] ?? 'ask_before_edit') : 'ask_before_edit');

  const mergedBypassDisabled = mergedPermissions.disableBypassPermissionsMode === 'disable';

  const savePermissionsKey = async (key: keyof PermissionsConfig, value: unknown) => {
    const current = (scopeSettings.permissions ?? {}) as Record<string, unknown>;
    const updated = { ...current, [key]: value };
    await updateSetting('permissions', updated as PermissionsConfig);
  };

  const deletePermissionsKey = async (key: keyof PermissionsConfig) => {
    const current = (scopeSettings.permissions ?? {}) as Record<string, unknown>;
    const updated = { ...current };
    delete updated[key];
    await updateSetting('permissions', updated as PermissionsConfig);
  };

  const defaultModeOptions: SelectOption[] = [
    ...(scope === 'project'
      ? [{ value: NOT_SET_VALUE, label: t('permissions.notSet'), italic: true }]
      : []),
    ...getAvailableModes(mergedBypassDisabled).map((modeId) => ({
      value: modeId,
      label: INPUT_MODES[modeId].label,
    })),
  ];

  return (
    <div>
      <h2 className="text-xl font-semibold text-text-primary mb-6">{t('permissions.heading')}</h2>

      <SettingSection title={t('permissions.bypassMode.sectionTitle')}>
        <SettingRow
          label={t('permissions.bypassMode.label')}
          description={t('permissions.bypassMode.description')}
          badge={
            <SettingBadge
              variant={SettingBadgeVariant.ClaudeNative}
              docHref="https://code.claude.com/docs/en/settings#permissions"
            />
          }
        >
          {isBypassNotSet ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-text-tertiary italic">{t('permissions.notSet')}</span>
              <ToggleSwitch
                checked={false}
                onChange={() => savePermissionsKey('disableBypassPermissionsMode', 'disable')}
                ariaLabel={t('permissions.bypassMode.label')}
              />
            </div>
          ) : (
            <ToggleSwitch
              checked={bypassDisabled}
              onChange={(checked) => {
                if (checked) {
                  return savePermissionsKey('disableBypassPermissionsMode', 'disable');
                }
                return deletePermissionsKey('disableBypassPermissionsMode');
              }}
              ariaLabel={t('permissions.bypassMode.label')}
            />
          )}
        </SettingRow>
      </SettingSection>

      <SettingSection title={t('permissions.defaultMode.sectionTitle')}>
        <SettingRow
          label={t('permissions.defaultMode.label')}
          description={t('permissions.defaultMode.description')}
          badge={
            <SettingBadge
              variant={SettingBadgeVariant.ClaudeNative}
              docHref="https://code.claude.com/docs/en/settings#permissions"
            />
          }
        >
          <Select
            value={isDefaultModeNotSet ? NOT_SET_VALUE : defaultModeValue}
            options={defaultModeOptions}
            ariaLabel={t('permissions.defaultMode.label')}
            onChange={(value) => {
              if (value === NOT_SET_VALUE) {
                deletePermissionsKey('defaultMode');
                return;
              }
              const cliFlag = INPUT_MODE_TO_CLI_FLAG[value as InputMode];
              if (cliFlag) {
                savePermissionsKey('defaultMode', cliFlag);
              }
            }}
            className={`bg-surface-overlay border border-border-default rounded-lg px-3 py-1.5 text-sm ${
              isDefaultModeNotSet ? 'text-text-tertiary' : 'text-text-primary'
            }`}
          />
        </SettingRow>
      </SettingSection>
    </div>
  );
}
