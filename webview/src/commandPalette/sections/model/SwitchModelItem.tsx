import { StaticItem } from '../../types';
import { i18n } from '@/i18n';
import { enKeyword } from '../../enKeyword';
import { SWITCH_MODEL_EVENT } from '@/pages/ChatPage/ModelSwitchOverlay';
import { useCliConfig } from '@/contexts/CliConfigContext';
import { useFableProbe } from '@/contexts/FableProbeContext';
import { useCurrentModel } from '@/hooks/useCurrentModel';
import { useVersionInfo } from '@/hooks/useVersionInfo';
import { resolveModelInfo, withFableFallback } from '@/types/models';

const SwitchModelValue = () => {
  const { controlResponse } = useCliConfig();
  const currentModel = useCurrentModel();
  const { cliVersion } = useVersionInfo();
  const { probedAvailable } = useFableProbe();
  const models = withFableFallback(controlResponse?.response?.response?.models ?? [], cliVersion, probedAvailable);
  // Unidentified models show their raw value rather than "Default" (issue #217).
  const info = resolveModelInfo(models, currentModel, { allowDefaultFallback: false });
  const text = info?.displayName ?? currentModel;
  return (
    <span className="text-[0.8461rem] text-text-secondary whitespace-nowrap">
      {text}
    </span>
  );
};

export const createSwitchModelItem = (): StaticItem =>
  new StaticItem('switch-model', i18n.t('commandPalette:model.switchModel'), {
    keywords: [enKeyword('commandPalette:model.switchModel'), 'model'],
    disabled: false,
    valueComponent: () => <SwitchModelValue />,
    action: async () => {
      window.dispatchEvent(new CustomEvent(SWITCH_MODEL_EVENT));
    },
  });
