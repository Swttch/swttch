export * from './ModelSection';
export * from './SwitchModelItem';
export * from './EffortItem';
export * from './ThinkingItem';
export * from './AccountUsageItem';
export * from './ToggleFastModeItem';
export * from './ToggleAutoResumeItem';

import { StaticItem } from '../../types';
import { createSwitchModelItem } from './SwitchModelItem';
import { createEffortItem } from './EffortItem';
import { createThinkingItem } from './ThinkingItem';
import { createAccountUsageItem } from './AccountUsageItem';
import { createToggleFastModeItem } from './ToggleFastModeItem';
import { createToggleAutoResumeItem } from './ToggleAutoResumeItem';

/**
 * Built on demand (not a module-eval constant) so the item labels resolve
 * against the current locale after i18n init. Called once when the registry
 * registers the Model section.
 */
export const getModelItems = (): StaticItem[] => [
  createSwitchModelItem(),
  createEffortItem(),
  createThinkingItem(),
  createAccountUsageItem(),
  createToggleFastModeItem(),
  createToggleAutoResumeItem(),
];
