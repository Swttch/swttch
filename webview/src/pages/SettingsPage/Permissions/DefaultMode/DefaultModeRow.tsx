import { SettingRow } from '../../common';
import { Select, type SelectOption } from '@/components/Select';
import { SettingBadge, SettingBadgeVariant } from '@/components';
import {
  type InputMode,
  InputModeValues,
  INPUT_MODES,
  getAvailableModes,
  resolveInitialInputMode,
  INPUT_MODE_TO_CLI_FLAG,
} from '@/types/chatInput';
import { useCliConfig } from '@/contexts/CliConfigContext';
import { useChatStreamContext } from '@/contexts/ChatStreamContext';
import { useClaudeSettings } from '@/contexts/ClaudeSettingsContext';
import { isAutoModeAvailable } from '@/types/models';
import { useTranslation } from '@/i18n';
import { usePermissionsConfig } from '../usePermissionsConfig';

/** The value standing for "this project says nothing; follow the global one". */
const NOT_SET_VALUE = '__NOT_SET__';

/** Which permission mode a new session opens in. */
export function DefaultModeRow() {
  const { t } = useTranslation('settings');
  const { permissions, mergedPermissions, savePermissionsKey, deletePermissionsKey, scope } =
    usePermissionsConfig();
  const { settings } = useClaudeSettings();
  const { controlResponse } = useCliConfig();
  const { sessionModel } = useChatStreamContext();

  const models = controlResponse?.response?.response?.models ?? [];
  // The running model wins when a session is live; before that, the model the
  // user has configured is the best prediction of what a new session will use.
  const mergedModel = settings.model as string | undefined;

  const rawDefaultMode = permissions.defaultMode;
  const isNotSet = rawDefaultMode === undefined && scope === 'project';
  const defaultModeValue = isNotSet ? NOT_SET_VALUE : resolveInitialInputMode(rawDefaultMode);

  // Auto mode is offered here under the same rule the chat input's mode panel
  // uses (computed in ChatStreamContext): the current model's `supportsAutoMode`
  // plus the `disableAutoMode` admin policy. `permissions.defaultMode` accepts
  // "auto" in the CLI's own settings schema, so hiding it outright kept GUI
  // users from a value the CLI allows (#272).
  const autoModeAvailable = isAutoModeAvailable(
    models,
    sessionModel ?? mergedModel,
    mergedPermissions.disableAutoMode,
  );

  // Until the model catalog arrives, availability is unknown rather than false.
  // A default already saved as "auto" must stay listed through that window, or
  // the dropdown would render a value it has no option for and silently show
  // the user something other than what is stored.
  const autoAlreadySaved = rawDefaultMode === INPUT_MODE_TO_CLI_FLAG[InputModeValues.AUTO];
  const showAuto = autoModeAvailable || (models.length === 0 && autoAlreadySaved);

  const mergedBypassDisabled = mergedPermissions.disableBypassPermissionsMode === 'disable';

  const options: SelectOption[] = [
    ...(scope === 'project'
      ? [{ value: NOT_SET_VALUE, label: t('permissions.notSet'), italic: true }]
      : []),
    ...getAvailableModes(mergedBypassDisabled, showAuto).map((modeId) => ({
      value: modeId,
      label: INPUT_MODES[modeId].label,
    })),
  ];

  return (
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
        value={defaultModeValue}
        options={options}
        ariaLabel={t('permissions.defaultMode.label')}
        onChange={(value) => {
          if (value === NOT_SET_VALUE) {
            void deletePermissionsKey('defaultMode');
            return;
          }
          const cliFlag = INPUT_MODE_TO_CLI_FLAG[value as InputMode];
          if (cliFlag) {
            void savePermissionsKey('defaultMode', cliFlag);
          }
        }}
        className={`bg-surface-overlay border border-border-default rounded-lg px-3 py-1.5 text-sm ${
          isNotSet ? 'text-text-tertiary' : 'text-text-primary'
        }`}
      />
    </SettingRow>
  );
}
