import { useState, useEffect, useRef } from 'react';
import { SettingSection, SettingRow, ScopeGuard } from '../common';
import { Select, type SelectOption } from '@/components/Select';
import { useSettings } from '@/contexts/SettingsContext';
import { useClaudeSettings } from '@/contexts/ClaudeSettingsContext';
import { SettingBadge, SettingBadgeVariant } from '@/components';
import { useBridge } from '@/hooks/useBridge';
import { SettingKey } from '@/types/settings';
import { isJetBrains } from '@/config/environment';
import { useCliConfig } from '@/contexts/CliConfigContext';
import { useVersionInfo } from '@/hooks/useVersionInfo';
import { useWorkingDir } from '@/contexts/WorkingDirContext';
import { useFableProbe, shouldProbeFable } from '@/contexts/FableProbeContext';
import { DEFAULT_MODEL_ALIAS, toModelAlias, withFableFallback } from '@/types/models';
import { MessageType } from '@/shared';
import { useTranslation } from '@/i18n';
import { OpenFilesWithRow } from './OpenFilesWithRow';

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
  const { t } = useTranslation('settings');
  const { settings, updateSetting, scope } = useSettings();
  const { send } = useBridge();
  const isJetBrainsEnv = isJetBrains();
  const { settings: claudeSettings, updateSetting: updateClaudeSetting } = useClaudeSettings();
  const { controlResponse } = useCliConfig();
  const { cliVersion } = useVersionInfo();
  const { probedAvailable, probeFableAvailability } = useFableProbe();
  const { workingDirectory } = useWorkingDir();
  const rawModels = controlResponse?.response?.response?.models ?? [];
  // Same Fable fallback the model picker uses, gated on the per-account probe —
  // so an account that cannot actually select Fable never sees it here either.
  const availableModels = withFableFallback(rawModels, cliVersion, probedAvailable);

  // Settings may be the first place the user looks for the default model, so run
  // the same availability probe the picker does (once per mount; cached backend-side).
  const probeFiredRef = useRef(false);
  useEffect(() => {
    if (!shouldProbeFable(rawModels, cliVersion) || probeFiredRef.current) return;
    probeFiredRef.current = true;
    void probeFableAvailability(workingDirectory ?? undefined);
  }, [rawModels, cliVersion, workingDirectory, probeFableAvailability]);

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

  const modelOptions: SelectOption[] =
    availableModels.length === 0
      ? [{ value: '', label: t('cli.model.defaultRecommended') }]
      : availableModels.map((m) => ({
          value: m.value === DEFAULT_MODEL_ALIAS ? '' : m.value,
          label: m.displayName,
        }));

  return (
    <div>
      <h2 className="text-xl font-semibold text-text-primary mb-6">{t('nav.cli')}</h2>

      <ScopeGuard supportedScope="global" currentScope={scope}>
        <SettingSection title={t('cli.openFilesWith.title')}>
          <OpenFilesWithRow />
        </SettingSection>
      </ScopeGuard>

      <ScopeGuard supportedScope="global" currentScope={scope}>
        <SettingSection title={t('cli.terminal.title')}>
          <SettingRow
            label={t('cli.terminal.app.label')}
            description={
              isJetBrainsEnv
                ? t('cli.terminal.app.jetbrainsDescription')
                : t('cli.terminal.app.description')
            }
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
        </SettingSection>
      </ScopeGuard>

      <SettingSection title={t('cli.model.title')}>
        <SettingRow
          label={t('cli.model.label')}
          description={t('cli.model.description')}
          badge={
            <SettingBadge
              variant={SettingBadgeVariant.ClaudeNative}
              docHref="https://code.claude.com/docs/en/model-config#setting-your-model"
            />
          }
        >
          <Select
            value={claudeSettings.model ? toModelAlias(claudeSettings.model) : ''}
            options={modelOptions}
            ariaLabel={t('cli.model.label')}
            onChange={(value) => void updateClaudeSetting('model', value || null)}
            className="bg-surface-overlay border border-border-default rounded-lg px-3 py-1.5 text-sm text-text-primary"
          />
        </SettingRow>
      </SettingSection>

      <ScopeGuard supportedScope="global" currentScope={scope}>
        <SettingSection title={t('cli.path.title')}>
          <SettingRow
            label={t('cli.path.label')}
            description={t('cli.path.description')}
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
        </SettingSection>

        <SettingSection title={t('cli.nodePath.title')}>
          <SettingRow
            label={t('cli.nodePath.label')}
            description={t('cli.nodePath.description')}
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
      </ScopeGuard>
    </div>
  );
}
