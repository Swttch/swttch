import { useCallback } from 'react';
import { useClaudeSettings } from '@/contexts/ClaudeSettingsContext';
import { useCliConfig } from '@/contexts/CliConfigContext';
import { useCurrentModel } from '@/hooks/useCurrentModel';
import {
  EFFORT_AUTO,
  EffortLevelDef,
  ULTRACODE_EFFORT,
  ULTRACODE_LABEL,
  getEffortDef,
  getModelEffortConfig,
  isUltracodeAvailable,
  nextEffortStep,
  parseEffortLevel,
} from '@/types/effort';

export interface UseEffortReturn {
  supportsEffort: boolean;
  levels: string[];
  current: string;
  def: EffortLevelDef;
  /** Whether the model+settings allow the ultracode top step. */
  ultracodeAvailable: boolean;
  /** Whether ultracode is currently engaged. */
  ultracodeEnabled: boolean;
  cycle: () => void;
  setLevel: (key: string) => void;
  enableUltracode: () => void;
}

/**
 * Resolves the current model's effort configuration from the CLI's
 * `control_response` and the user's settings, and exposes helpers to change it.
 *
 * Keeps the model → levels inference in one place so UI consumers (command
 * palette row, Modes panel, keyboard handler) don't reimplement it.
 *
 * - `cycle` advances to the next step (Shift+Tab / Enter), including the
 *   ultracode top step when available, wrapping back to the first level.
 * - `setLevel` jumps straight to a chosen level (slider click/drag), clearing
 *   ultracode if it was on.
 * - `enableUltracode` engages ultracode = xhigh effort + the workflows flag.
 *
 * Both values go to the same store, ~/.claude/settings.json, because both are
 * official Claude settings keys that the CLI reads from there: `effortLevel`
 * pins the effort, and `ultracode` turns on xhigh effort plus standing
 * dynamic-workflow orchestration. Writing `ultracode` app-side instead left the
 * workflow half of the top notch with no way to reach the CLI at all (#377).
 *
 * Note on persistence: the CLI describes `ultracode` as a per-session flag, but
 * the settings file is a documented way to set it, so a value written here stays
 * on until the slider clears it.
 */
export function useEffort(): UseEffortReturn {
  const { settings, updateSetting } = useClaudeSettings();
  const { controlResponse } = useCliConfig();
  const currentModel = useCurrentModel();

  const { supportsEffort, levels } = getModelEffortConfig(controlResponse, currentModel);
  const current = parseEffortLevel(settings.effortLevel, levels);

  const ultracodeAvailable =
    supportsEffort && isUltracodeAvailable(levels, settings.disableWorkflows);
  const ultracodeEnabled = ultracodeAvailable && settings.ultracode === true;

  const def: EffortLevelDef = ultracodeEnabled
    ? { key: 'ultracode', label: ULTRACODE_LABEL, filledDots: levels.length, totalDots: levels.length }
    : getEffortDef(current, levels);

  const enableUltracode = useCallback(() => {
    if (!ultracodeAvailable) return;
    // Order mirrors Cursor: pin xhigh effort first, then raise the flag.
    void (async () => {
      await updateSetting('effortLevel', ULTRACODE_EFFORT);
      await updateSetting('ultracode', true);
    })();
  }, [ultracodeAvailable, updateSetting]);

  const setLevel = useCallback((key: string) => {
    if (!supportsEffort) return;
    void (async () => {
      // Clear the ultracode flag first if it was engaged, mirroring Cursor's
      // setEffortLevel (which writes ultracode:null before the new level).
      if (settings.ultracode === true) {
        await updateSetting('ultracode', null);
      }
      // `auto` is the plugin-side sentinel — persist it as `null` (CLI default).
      await updateSetting('effortLevel', key === EFFORT_AUTO ? null : key);
    })();
  }, [supportsEffort, settings.ultracode, updateSetting]);

  const cycle = useCallback(() => {
    if (!supportsEffort) return;
    const step = nextEffortStep(settings.effortLevel, ultracodeEnabled, levels, ultracodeAvailable);
    if (step.kind === 'ultracode') {
      enableUltracode();
    } else {
      setLevel(step.key);
    }
  }, [supportsEffort, settings.effortLevel, ultracodeEnabled, levels, ultracodeAvailable, enableUltracode, setLevel]);

  return {
    supportsEffort,
    levels,
    current,
    def,
    ultracodeAvailable,
    ultracodeEnabled,
    cycle,
    setLevel,
    enableUltracode,
  };
}
