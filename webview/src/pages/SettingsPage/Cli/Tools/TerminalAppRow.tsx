import { useState, useEffect } from 'react';
import { SettingRow } from '../../common';
import { Select, type SelectOption } from '@/components/Select';
import { useSettings } from '@/contexts/SettingsContext';
import { useBridge } from '@/hooks/useBridge';
import { SettingKey } from '@/types/settings';
import { isJetBrains } from '@/config/environment';
import { MessageType } from '@/shared';
import { useTranslation } from '@/i18n';
import { useIsOverriddenByProject } from '@/utils/settingsScope';

interface TerminalInfo {
  id: string;
  name: string;
  path: string;
  isDefault: boolean;
}

/** Stored as the app's own name, so this marker stands for "not one of these". */
const CUSTOM_MARKER = '__custom__';

function toSelectValue(app: string | null, terminals: TerminalInfo[]): string {
  if (app === null) return '';
  if (terminals.some((t) => t.name === app)) return app;
  return CUSTOM_MARKER;
}

/**
 * Which terminal application "Open in terminal" launches.
 *
 * Inside a JetBrains IDE there is nothing to choose: the IDE's own terminal is
 * the one that opens. The row says so rather than offering a list that would be
 * ignored.
 */
export function TerminalAppRow() {
  const { t } = useTranslation('settings');
  const isOverridden = useIsOverriddenByProject();
  const { settings, updateSetting } = useSettings();
  const { send } = useBridge();
  const isJetBrainsEnv = isJetBrains();

  const [terminals, setTerminals] = useState<TerminalInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    send(MessageType.GET_AVAILABLE_TERMINALS, {})
      .then((res) => {
        setTerminals((res?.terminals as TerminalInfo[]) ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [send]);

  const terminalApp = settings[SettingKey.TERMINAL_APP];
  const selectValue = toSelectValue(terminalApp, terminals);
  const [customInput, setCustomInput] = useState(
    selectValue === CUSTOM_MARKER ? (terminalApp ?? '') : '',
  );

  const terminalOptions: SelectOption[] = [
    { value: '', label: t('cli.terminal.app.systemDefault') },
    ...terminals.map((terminal) => ({
      value: terminal.name,
      label: terminal.isDefault
        ? t('cli.terminal.app.defaultSuffix', { label: terminal.name })
        : terminal.name,
    })),
    { value: CUSTOM_MARKER, label: t('cli.terminal.app.custom') },
  ];

  return (
    <SettingRow
      label={t('cli.terminal.app.label')}
      description={
        isJetBrainsEnv
          ? t('cli.terminal.app.jetbrainsDescription')
          : t('cli.terminal.app.description')
      }
      isOverridden={isOverridden(SettingKey.TERMINAL_APP)}
    >
      {isJetBrainsEnv ? (
        <span className="text-sm text-text-tertiary">{t('cli.terminal.app.jetbrainsValue')}</span>
      ) : loading ? (
        <span className="text-sm text-text-tertiary">{t('cli.terminal.app.detecting')}</span>
      ) : (
        <div className="flex items-center gap-2">
          <Select
            value={selectValue}
            options={terminalOptions}
            ariaLabel={t('cli.terminal.app.label')}
            onChange={(value) => {
              if (value === CUSTOM_MARKER) {
                void updateSetting(SettingKey.TERMINAL_APP, customInput || null);
              } else {
                void updateSetting(SettingKey.TERMINAL_APP, value || null);
              }
            }}
            className="bg-surface-overlay border border-border-default rounded-lg px-3 py-1.5 text-sm text-text-primary"
          />
          {selectValue === CUSTOM_MARKER && (
            <input
              type="text"
              value={customInput}
              onChange={(e) => {
                setCustomInput(e.target.value);
                void updateSetting(SettingKey.TERMINAL_APP, e.target.value || null);
              }}
              placeholder={t('cli.terminal.app.customPlaceholder')}
              className="w-64 bg-surface-overlay border border-border-default rounded-lg px-3 py-1.5 text-sm text-text-primary placeholder-text-tertiary"
            />
          )}
        </div>
      )}
    </SettingRow>
  );
}
