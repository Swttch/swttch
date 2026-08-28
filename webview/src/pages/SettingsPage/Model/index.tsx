import { useEffect, useRef } from 'react';
import { SettingSection, SettingRow } from '../common';
import { Select, type SelectOption } from '@/components/Select';
import { ToggleSwitch } from '@/components/ToggleSwitch';
import { useSettings } from '@/contexts/SettingsContext';
import { useClaudeSettings } from '@/contexts/ClaudeSettingsContext';
import { SettingBadge, SettingBadgeVariant } from '@/components';
import { SettingKey } from '@/types/settings';
import { useCliConfig } from '@/contexts/CliConfigContext';
import { useVersionInfo } from '@/hooks/useVersionInfo';
import { useWorkingDir } from '@/contexts/WorkingDirContext';
import { useFableProbe, shouldProbeFable } from '@/contexts/FableProbeContext';
import { DEFAULT_MODEL_ALIAS, withFableFallback } from '@/types/models';
import { useTranslation } from '@/i18n';
import { useIsOverriddenByProject } from '@/utils/settingsScope';

export function ModelSettings() {
  const isOverridden = useIsOverriddenByProject();
  const { t } = useTranslation('settings');
  const { settings, updateSetting } = useSettings();
  const syncModelToDefault = settings[SettingKey.SYNC_MODEL_TO_DEFAULT];
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

  const modelOptions: SelectOption[] =
    availableModels.length === 0
      ? [{ value: '', label: t('cli.model.defaultRecommended') }]
      : availableModels.map((m) => ({
          value: m.value === DEFAULT_MODEL_ALIAS ? '' : m.value,
          label: m.displayName,
        }));

  return (
    <div>
      <h2 className="text-xl font-semibold text-text-primary mb-6">{t('nav.model')}</h2>

      <SettingSection>
        <SettingRow
          label={t('cli.model.label')}
          description={t('cli.model.description')}
          isOverridden={isOverridden('model')}
          badge={
            <SettingBadge
              variant={SettingBadgeVariant.ClaudeNative}
              docHref="https://code.claude.com/docs/en/model-config#setting-your-model"
            />
          }
        >
          <Select
            value={claudeSettings.model || ''}
            options={modelOptions}
            ariaLabel={t('cli.model.label')}
            onChange={(value) => void updateClaudeSetting('model', value || null)}
            className="bg-surface-overlay border border-border-default rounded-lg px-3 py-1.5 text-sm text-text-primary"
          />
        </SettingRow>

        <SettingRow
          label={t('cli.model.syncToDefault.label')}
          description={t('cli.model.syncToDefault.description')}
          isOverridden={isOverridden(SettingKey.SYNC_MODEL_TO_DEFAULT)}
        >
          <ToggleSwitch
            checked={syncModelToDefault}
            onChange={(checked) => updateSetting(SettingKey.SYNC_MODEL_TO_DEFAULT, checked)}
            ariaLabel={t('cli.model.syncToDefault.label')}
          />
        </SettingRow>
      </SettingSection>
    </div>
  );
}
