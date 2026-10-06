import { useCallback } from 'react';
import { useClaudeSettings } from '@/contexts/ClaudeSettingsContext';
import { useCliConfig } from '@/contexts/CliConfigContext';
import { useChatStreamContext } from '@/contexts/ChatStreamContext';
import { useBridge } from '@/hooks/useBridge';
import { MessageType } from '@/shared';
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
  /** Resolves once the level is stored; rejects if the write failed (the settings cache has already rolled back). */
  setLevel: (key: string) => Promise<void>;
  /** Same contract as `setLevel`. */
  enableUltracode: () => Promise<void>;
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
 *
 * Two more things keep the slider honest about the session it belongs to.
 *
 * - A change is written to the settings file (what a CLI spawned later reads) and
 *   also told to the CLI that is running now (SET_EFFORT). The file alone never
 *   reaches a running CLI, which reads it only at startup.
 * - After a reply, the level the CLI says it ran at (EFFORT_APPLIED) is what the
 *   slider shows, ahead of the stored setting, until the user moves the slider
 *   again. The optimistic value is what was asked for; this is what happened.
 */
export function useEffort(): UseEffortReturn {
  const { settings, updateSetting } = useClaudeSettings();
  const { controlResponse } = useCliConfig();
  const currentModel = useCurrentModel();
  const { appliedEffort, clearAppliedEffort } = useChatStreamContext();
  const { send } = useBridge();

  const { supportsEffort, levels } = getModelEffortConfig(controlResponse, currentModel);
  // What the last reply ran at wins over what was stored; null until there is a reply.
  const reportedLevel = appliedEffort ?? null;
  const current = parseEffortLevel(reportedLevel ?? settings.effortLevel, levels);

  const ultracodeAvailable =
    supportsEffort && isUltracodeAvailable(levels, settings.disableWorkflows);
  // Ultracode runs at its xhigh floor. A reply that ran at another level means it is not in effect.
  const ultracodeEnabled =
    ultracodeAvailable && settings.ultracode === true &&
    (reportedLevel === null || reportedLevel === ULTRACODE_EFFORT);

  const def: EffortLevelDef = ultracodeEnabled
    ? { key: 'ultracode', label: ULTRACODE_LABEL, filledDots: levels.length, totalDots: levels.length }
    : getEffortDef(current, levels);

  /**
   * Tells the CLI that is running now. The change is already stored, which is all a CLI
   * spawned later needs, so a failure here must not undo it or surface as an error.
   */
  const tellRunningCli = useCallback(async (change: { effortLevel?: string | null; ultracode?: boolean }) => {
    try {
      await send(MessageType.SET_EFFORT, change);
    } catch (error) {
      console.warn('[useEffort] Could not tell the running CLI about the effort change:', error);
    }
  }, [send]);

  const enableUltracode = useCallback(async () => {
    if (!ultracodeAvailable) return;
    // The user has chosen: the last reply's level no longer describes what the slider asks for.
    clearAppliedEffort?.();
    // Order mirrors Cursor: pin xhigh effort first, then raise the flag.
    await updateSetting('effortLevel', ULTRACODE_EFFORT);
    await updateSetting('ultracode', true);
    await tellRunningCli({ effortLevel: ULTRACODE_EFFORT, ultracode: true });
  }, [ultracodeAvailable, updateSetting, clearAppliedEffort, tellRunningCli]);

  const setLevel = useCallback(async (key: string) => {
    if (!supportsEffort) return;
    clearAppliedEffort?.();
    // Clear the ultracode flag first if it was engaged, mirroring Cursor's
    // setEffortLevel (which writes ultracode:null before the new level).
    const ultracodeWasOn = settings.ultracode === true;
    if (ultracodeWasOn) {
      await updateSetting('ultracode', null);
    }
    // `auto` is the plugin-side sentinel — persist it as `null` (CLI default).
    const level = key === EFFORT_AUTO ? null : key;
    await updateSetting('effortLevel', level);
    await tellRunningCli(ultracodeWasOn ? { effortLevel: level, ultracode: false } : { effortLevel: level });
  }, [supportsEffort, settings.ultracode, updateSetting, clearAppliedEffort, tellRunningCli]);

  const cycle = useCallback(() => {
    if (!supportsEffort) return;
    const step = nextEffortStep(reportedLevel ?? settings.effortLevel, ultracodeEnabled, levels, ultracodeAvailable);
    // Fire and forget: a failed write has already rolled the settings cache back.
    if (step.kind === 'ultracode') {
      void enableUltracode().catch(() => undefined);
    } else {
      void setLevel(step.key).catch(() => undefined);
    }
  }, [supportsEffort, reportedLevel, settings.effortLevel, ultracodeEnabled, levels, ultracodeAvailable, enableUltracode, setLevel]);

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
