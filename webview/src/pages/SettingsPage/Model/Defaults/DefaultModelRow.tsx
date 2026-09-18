import { useEffect, useRef } from 'react';
import { SettingRow } from '../../common';
import { Select, type SelectOption } from '@/components/Select';
import { useClaudeSettings } from '@/contexts/ClaudeSettingsContext';
import { SettingBadge, SettingBadgeVariant } from '@/components';
import { useCliConfig } from '@/contexts/CliConfigContext';
import { useVersionInfo } from '@/hooks/useVersionInfo';
import { useWorkingDir } from '@/contexts/WorkingDirContext';
import { useFableProbe, shouldProbeFable } from '@/contexts/FableProbeContext';
import { DEFAULT_MODEL_ALIAS, resolveModelRowText, withFableFallback } from '@/types/models';
import { useTranslation } from '@/i18n';
import { useIsOverriddenByProject } from '@/utils/settingsScope';

/** Which model a new session starts on. */
export function DefaultModelRow() {
  const { t } = useTranslation('settings');
  const isOverridden = useIsOverriddenByProject();
  const { settings: claudeSettings, updateSetting: updateClaudeSetting } = useClaudeSettings();
  const { controlResponse } = useCliConfig();
  const { cliVersion } = useVersionInfo();
  const { probedAvailable, probedCanonicalModel, probeFableAvailability } = useFableProbe();
  const { workingDirectory } = useWorkingDir();

  const rawModels = controlResponse?.response?.response?.models ?? [];
  // Same Fable fallback the model picker uses, gated on the per-account probe —
  // so an account that cannot actually select Fable never sees it here either.
  const availableModels = withFableFallback(
    rawModels,
    cliVersion,
    probedAvailable,
    probedCanonicalModel,
  );

  // Settings may be the first place the user looks for the default model, so run
  // the same availability probe the picker does (once per mount; cached
  // backend-side).
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
          // Not `displayName`: a remapped slot advertises Anthropic's name while
          // running someone else's model, and picking a default by a name that
          // is not the model's is how the wrong default gets saved.
          label: resolveModelRowText(m).title,
        }));

  return (
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
  );
}
