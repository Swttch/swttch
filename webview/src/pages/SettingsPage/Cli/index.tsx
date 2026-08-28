import { useState, useEffect } from 'react';
import { SettingSection, SettingRow } from '../common';
import { Select, type SelectOption } from '@/components/Select';
import { useSettings } from '@/contexts/SettingsContext';
import { useBridge } from '@/hooks/useBridge';
import { SettingKey } from '@/types/settings';
import { isJetBrains } from '@/config/environment';
import { MessageType } from '@/shared';
import { useTranslation } from '@/i18n';
import { OpenFilesWithRow } from './OpenFilesWithRow';
import { useIsOverriddenByProject } from '@/utils/settingsScope';

interface TerminalInfo {
  id: string;
  name: string;
  path: string;
  isDefault: boolean;
}

const CUSTOM_MARKER = '__custom__';

function toSelectValue(app: string | null, terminals: TerminalInfo[]): string {
  if (app === null) return '';
  if (terminals.some((t) => t.name === app)) return app;
  return CUSTOM_MARKER;
}

export function CliSettings() {
  const isOverridden = useIsOverriddenByProject();
  const { t } = useTranslation('settings');
  const { settings, updateSetting } = useSettings();
  const { send } = useBridge();
  const isJetBrainsEnv = isJetBrains();

  const [terminals, setTerminals] = useState<TerminalInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [detectedCliPath, setDetectedCliPath] = useState<string | null>(null);
  const [detectedNodePath, setDetectedNodePath] = useState<string | null>(null);

  useEffect(() => {
    send(MessageType.GET_AVAILABLE_TERMINALS, {})
      .then((res) => {
        setTerminals((res?.terminals as TerminalInfo[]) ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [send]);

  useEffect(() => {
    send(MessageType.GET_DETECTED_CLI_PATH, {})
      .then((res) => {
        setDetectedCliPath((res?.path as string | null) ?? null);
      })
      .catch(() => setDetectedCliPath(null));
  }, [send]);

  useEffect(() => {
    send(MessageType.GET_DETECTED_NODE_PATH, {})
      .then((res) => {
        setDetectedNodePath((res?.path as string | null) ?? null);
      })
      .catch(() => setDetectedNodePath(null));
  }, [send]);

  const terminalApp = settings[SettingKey.TERMINAL_APP];
  const selectValue = toSelectValue(terminalApp, terminals);
  const [customInput, setCustomInput] = useState(
    selectValue === CUSTOM_MARKER ? (terminalApp ?? '') : '',
  );

  const handleSelectChange = (value: string) => {
    if (value === CUSTOM_MARKER) {
      void updateSetting(SettingKey.TERMINAL_APP, customInput || null);
    } else {
      void updateSetting(SettingKey.TERMINAL_APP, value || null);
    }
  };

  const handleCustomInput = (value: string) => {
    setCustomInput(value);
    void updateSetting(SettingKey.TERMINAL_APP, value || null);
  };

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
    <div>
      <h2 className="text-xl font-semibold text-text-primary mb-6">{t('nav.cli')}</h2>

      <SettingSection>
        <OpenFilesWithRow />

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
                onChange={handleSelectChange}
                className="bg-surface-overlay border border-border-default rounded-lg px-3 py-1.5 text-sm text-text-primary"
              />
              {selectValue === CUSTOM_MARKER && (
                <input
                  type="text"
                  value={customInput}
                  onChange={(e) => handleCustomInput(e.target.value)}
                  placeholder={t('cli.terminal.app.customPlaceholder')}
                  className="w-40 bg-surface-overlay border border-border-default rounded-lg px-3 py-1.5 text-sm text-text-primary placeholder-text-tertiary"
                />
              )}
            </div>
          )}
        </SettingRow>

        <SettingRow
          label={t('cli.path.label')}
          description={t('cli.path.description')}
          isOverridden={isOverridden(SettingKey.CLI_PATH)}
        >
          <div className="flex flex-col items-end gap-1">
            <input
              type="text"
              value={settings[SettingKey.CLI_PATH] || ''}
              onChange={(e) => updateSetting(SettingKey.CLI_PATH, e.target.value || null)}
              placeholder={t('cli.path.placeholder')}
              className="w-64 bg-surface-overlay border border-border-default rounded-lg px-3 py-1.5 text-sm text-text-primary placeholder-text-tertiary"
            />
            {detectedCliPath && !settings[SettingKey.CLI_PATH] && (
              <span className="text-xs text-text-tertiary truncate max-w-64" title={detectedCliPath}>
                {detectedCliPath}
              </span>
            )}
          </div>
        </SettingRow>

        <SettingRow
          label={t('cli.nodePath.label')}
          description={t('cli.nodePath.description')}
          isOverridden={isOverridden(SettingKey.NODE_PATH)}
        >
          <div className="flex flex-col items-end gap-1">
            <input
              type="text"
              value={settings[SettingKey.NODE_PATH] || ''}
              onChange={(e) => updateSetting(SettingKey.NODE_PATH, e.target.value || null)}
              placeholder={t('cli.nodePath.placeholder')}
              className="w-64 bg-surface-overlay border border-border-default rounded-lg px-3 py-1.5 text-sm text-text-primary placeholder-text-tertiary"
            />
            {detectedNodePath && !settings[SettingKey.NODE_PATH] && (
              <span className="text-xs text-text-tertiary truncate max-w-64" title={detectedNodePath}>
                {detectedNodePath}
              </span>
            )}
          </div>
        </SettingRow>
      </SettingSection>
    </div>
  );
}
