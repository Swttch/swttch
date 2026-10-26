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
  modelsToKeepLegacyEffort,
  nextEffortStep,
  parseEffortLevel,
  resolveEffortModel,
  storedEffortLevel,
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
 *   ultracode if it was on. `auto` is the way back to "no level picked": the
 *   stored level of this model is dropped and the CLI decides again.
 * - `enableUltracode` engages ultracode = xhigh effort + the workflows flag.
 *
 * Where each value goes. `ultracode` is an official Claude settings key, written
 * to ~/.claude/settings.json from here: it turns on xhigh effort plus standing
 * dynamic-workflow orchestration, and writing it app-side instead left the
 * workflow half of the top notch with no way to reach the CLI at all (#377).
 * The level is not written from here. It goes to the backend (SET_EFFORT), which
 * stores it as `modelSettings.<model>.effortLevel`, so each model keeps its own
 * level and the CLI reads it itself (#604).
 *
 * Note on persistence: the CLI describes `ultracode` as a per-session flag, but
 * the settings file is a documented way to set it, so a value written here stays
 * on until the slider clears it.
 *
 * Two more things keep the slider honest about the session it belongs to.
 *
 * - A change is also told to the CLI that is running now. The settings file alone
 *   never reaches a running CLI, which reads it only at startup.
 * - After a reply, the level the CLI says it ran at (EFFORT_APPLIED) is what the
 *   slider shows, ahead of the stored setting, until the user moves the slider
 *   again. The optimistic value is what was asked for; this is what happened.
 */
export function useEffort(): UseEffortReturn {
  const { settings, updateSetting, clearSaveError, reportSaveError } = useClaudeSettings();
  const { controlResponse } = useCliConfig();
  const currentModel = useCurrentModel();
  const { appliedEffort, clearAppliedEffort } = useChatStreamContext();
  const { send } = useBridge();

  const { supportsEffort, levels } = getModelEffortConfig(controlResponse, currentModel);
  // The model the level belongs to, spelled as the settings file names it; null when it cannot be told.
  const effortModel = resolveEffortModel(controlResponse, currentModel);
  // What the last reply ran at wins over what was stored; null until there is a reply.
  const reportedLevel = appliedEffort ?? null;
  // The stored level is this model's own entry, or the top-level `effortLevel` of a user who has no
  // per-model level anywhere (what every older version of the slider wrote). See storedEffortLevel.
  const storedLevel = storedEffortLevel(settings.modelSettings, settings.effortLevel, effortModel);
  const current = parseEffortLevel(reportedLevel ?? storedLevel, levels);

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
   * Hands the pick to the backend, which stores it for the model, remembers it for the session and tells
   * the CLI that is running now. A refusal to store it (a settings file that cannot be read) rejects, so
   * the caller knows the slider did not move; the backend has not applied it in that case.
   */
  const sendEffort = useCallback(async (change: { effortLevel?: string | null; ultracode?: boolean }) => {
    try {
      // The first level written for a model ends the era of the one top-level level: the other models keep it
      // as levels of their own (modelsToKeepLegacyEffort). Auto and a pick that cannot be stored do not.
      const inheritLegacy = typeof change.effortLevel === 'string' && effortModel
        ? modelsToKeepLegacyEffort(controlResponse, settings.modelSettings, settings.effortLevel, effortModel)
        : [];
      const ack = await send<{ status?: string; error?: string }>(MessageType.SET_EFFORT, {
        ...change,
        model: effortModel,
        ...(inheritLegacy.length > 0 && { inheritLegacy }),
      });
      if (ack?.status === 'error') throw new Error(ack.error || 'Could not save the effort level');
      clearSaveError?.();
    } catch (error) {
      // The same banner a refused `updateSetting` fills: a settings file that cannot be read says why (#595).
      reportSaveError?.(error);
      throw error;
    }
  }, [send, effortModel, controlResponse, settings.modelSettings, settings.effortLevel, clearSaveError, reportSaveError]);

  const enableUltracode = useCallback(async () => {
    if (!ultracodeAvailable) return;
    // The user has chosen: the last reply's level no longer describes what the slider asks for.
    clearAppliedEffort?.();
    // Order mirrors Cursor: pin xhigh effort first, then raise the flag.
    await updateSetting('ultracode', true);
    await sendEffort({ effortLevel: ULTRACODE_EFFORT, ultracode: true });
  }, [ultracodeAvailable, updateSetting, clearAppliedEffort, sendEffort]);

  const setLevel = useCallback(async (key: string) => {
    if (!supportsEffort) return;
    clearAppliedEffort?.();
    // Clear the ultracode flag first if it was engaged, mirroring Cursor's
    // setEffortLevel (which writes ultracode:null before the new level).
    const ultracodeWasOn = settings.ultracode === true;
    if (ultracodeWasOn) {
      await updateSetting('ultracode', null);
    }
    // `auto` is the plugin-side sentinel: it asks the backend to drop this model's stored level.
    const level = key === EFFORT_AUTO ? null : key;
    await sendEffort(ultracodeWasOn ? { effortLevel: level, ultracode: false } : { effortLevel: level });
  }, [supportsEffort, settings.ultracode, updateSetting, clearAppliedEffort, sendEffort]);

  const cycle = useCallback(() => {
    if (!supportsEffort) return;
    const step = nextEffortStep(reportedLevel ?? storedLevel, ultracodeEnabled, levels, ultracodeAvailable);
    // Fire and forget: a failed save leaves the slider where it was.
    if (step.kind === 'ultracode') {
      void enableUltracode().catch(() => undefined);
    } else {
      void setLevel(step.key).catch(() => undefined);
    }
  }, [supportsEffort, reportedLevel, storedLevel, ultracodeEnabled, levels, ultracodeAvailable, enableUltracode, setLevel]);

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
