/**
 * Claude Code CLI effort level configuration.
 *
 * The CLI reports per-model effort support via the `control_response`
 * returned from `initialize` (see `ModelInfo.supportsEffort` and
 * `ModelInfo.supportedEffortLevels`). The plugin derives the available
 * levels from that response rather than hardcoding them, so newly added
 * values (e.g. `xhigh`, `max`) and per-model differences are respected.
 *
 * `auto` is a plugin-side sentinel meaning "use the CLI default" — it is
 * persisted to `~/.claude/settings.json` as `effortLevel: null`. It is NOT a
 * slider step: matching the Cursor extension, the levels are exactly the
 * model's `supportedEffortLevels` (low/medium/high/xhigh/max), and `auto` is
 * only the label shown while the level is unset.
 */
import { resolveModelInfo } from './models';
import type { CliConfigControlResponse, ModelInfo } from './slashCommand';

export const EFFORT_AUTO = 'auto';

export interface EffortLevelDef {
  key: string;
  label: string;
  filledDots: number;
  totalDots: number;
}

// Display labels, matching the Cursor extension's map exactly
// ({low:"Low",medium:"Medium",high:"High",xhigh:"Extra high",max:"Max"}).
function labelFor(key: string): string {
  if (key === EFFORT_AUTO) return 'Auto';
  if (key === 'xhigh') return 'Extra high';
  return key.charAt(0).toUpperCase() + key.slice(1);
}

/**
 * The slider steps: exactly the model's supported levels, no `auto` step.
 */
export function buildEffortLevels(supported: string[]): EffortLevelDef[] {
  const totalDots = supported.length;
  return supported.map((key, i) => ({
    key,
    label: labelFor(key),
    filledDots: i + 1,
    totalDots,
  }));
}

/**
 * Resolve the def for the current value. Unset (null/undefined/`auto`) yields
 * the "Auto" label with no filled dots — the slider then sits at the first
 * stop, exactly as the Cursor extension renders an unset level.
 */
export function getEffortDef(
  key: string | null | undefined,
  supported: string[],
): EffortLevelDef {
  if (!key || key === EFFORT_AUTO) {
    return { key: EFFORT_AUTO, label: 'Auto', filledDots: 0, totalDots: supported.length };
  }
  const levels = buildEffortLevels(supported);
  return (
    levels.find((l) => l.key === key) ??
    { key: EFFORT_AUTO, label: 'Auto', filledDots: 0, totalDots: supported.length }
  );
}

/**
 * Advance to the next effort level, wrapping max → first. The unset state
 * (`auto`/null) advances to the first level. Never returns `auto`: once a
 * level is chosen the cycle stays within low…max, matching Cursor.
 */
export function nextEffortLevel(
  current: string | null | undefined,
  supported: string[],
): string | null {
  if (supported.length === 0) return null;
  // Unset/auto → indexOf is -1 → next is supported[0].
  const idx = current ? supported.indexOf(current) : -1;
  return supported[(idx + 1) % supported.length];
}

/**
 * The slider's steps: `auto` first, then the model's supported levels.
 *
 * `auto` is "no level picked here, the CLI decides" (its own `modelSettings`, then the model's default).
 * It used to be only the label of the unset state, drawn on the Low notch, so a user who had moved the
 * slider could not return to it (#604). It is a step of its own now, and the way back.
 */
export function buildEffortSteps(supported: string[]): EffortLevelDef[] {
  const totalDots = supported.length;
  return [
    { key: EFFORT_AUTO, label: labelFor(EFFORT_AUTO), filledDots: 0, totalDots },
    ...buildEffortLevels(supported),
  ];
}

/** A model id as the settings file names it: no `[1m]` suffix, no date. Null for an alias such as `opusplan`. */
export function canonicalModelName(model: string | null | undefined): string | null {
  if (typeof model !== 'string') return null;
  const bare = model.trim().replace(/\[[^\]]*\]$/, '').replace(/-\d{8}$/, '');
  return bare.startsWith('claude-') ? bare : null;
}

/**
 * The model the slider picks a level for, spelled as the settings file names it, or null when it cannot be
 * told (the picker shows an alias and the catalog does not say what it resolved to). A null means the pick
 * lasts for the session and is not stored.
 */
export function resolveEffortModel(
  controlResponse: CliConfigControlResponse | null,
  currentModel: string | null | undefined,
): string | null {
  const models: ModelInfo[] = controlResponse?.response?.response?.models ?? [];
  const info = resolveModelInfo(models, currentModel);
  return canonicalModelName(info?.resolvedModel) ?? canonicalModelName(currentModel);
}

/**
 * The level the settings files give [model]: `modelSettings.<model>.effortLevel`. The CLI matches the
 * canonical name against dated, `[1m]` and provider spellings of the key, so the keys are compared in
 * canonical form too. Undefined when nothing is stored, which is Auto.
 */
export function storedModelEffort(
  modelSettings: Record<string, Record<string, unknown>> | null | undefined,
  model: string | null,
): string | undefined {
  if (!modelSettings || !model) return undefined;
  for (const [key, entry] of Object.entries(modelSettings)) {
    if (canonicalModelName(key) === model && typeof entry?.effortLevel === 'string') return entry.effortLevel;
  }
  return undefined;
}

/**
 * The models that should keep the old top-level level when the first per-model level is written.
 *
 * Until then the top-level `effortLevel` reached every model, as the `--effort` flag the backend passed.
 * The moment one model gets a level of its own that flag stops (it would outrank the new level), and the
 * CLI ignores a top-level value for every model it was measured on (2.1.310, Sonnet and Opus), so each
 * other model would fall to the model default. Writing the old level into each of them first keeps what
 * those models ran at. Only models that take the level are listed, spelled as the settings file names them.
 */
export function modelsToKeepLegacyEffort(
  controlResponse: CliConfigControlResponse | null,
  modelSettings: Record<string, Record<string, unknown>> | null | undefined,
  topLevelEffort: string | null | undefined,
  pickedModel: string | null,
): string[] {
  if (typeof topLevelEffort !== 'string' || topLevelEffort === '' || hasModelEffort(modelSettings)) return [];
  const models: ModelInfo[] = controlResponse?.response?.response?.models ?? [];
  const names = new Set<string>();
  for (const info of models) {
    if (!info.supportsEffort || !(info.supportedEffortLevels ?? []).includes(topLevelEffort)) continue;
    const name = canonicalModelName(info.resolvedModel);
    if (name && name !== pickedModel) names.add(name);
  }
  return [...names];
}

/** Whether any model has a level of its own in `modelSettings`. */
export function hasModelEffort(
  modelSettings: Record<string, Record<string, unknown>> | null | undefined,
): boolean {
  return Object.values(modelSettings ?? {}).some((entry) => typeof entry?.effortLevel === 'string');
}

/**
 * The level to show as stored for [model].
 *
 * Its own `modelSettings` entry first. Failing that, the top-level `effortLevel`, but only while no model
 * has a level of its own: that top-level value is what every version of the slider before #604 wrote, and
 * the backend still passes it as `--effort` in exactly that case (legacyEffortFlag in claude-process.ts), so
 * the slider keeps naming the level the sessions of an upgraded user really run at. The day any model gets
 * a level of its own, the user is working per model and the top-level value no longer speaks for it.
 */
export function storedEffortLevel(
  modelSettings: Record<string, Record<string, unknown>> | null | undefined,
  topLevelEffort: string | null | undefined,
  model: string | null,
): string | undefined {
  const own = storedModelEffort(modelSettings, model);
  if (own !== undefined) return own;
  if (hasModelEffort(modelSettings)) return undefined;
  return typeof topLevelEffort === 'string' && topLevelEffort !== '' ? topLevelEffort : undefined;
}

export function parseEffortLevel(
  value: string | null | undefined,
  supported: string[],
): string {
  if (!value) return EFFORT_AUTO;
  return supported.includes(value) ? value : EFFORT_AUTO;
}

// ─── Ultracode ───────────────────────────────────────────────────────────────
// Ultracode is a synthetic step above the real effort levels: it means "xhigh
// effort + standing workflow orchestration". It is not an effortLevel value but
// a settings key of its own (`ultracode`), which the CLI reads alongside
// `effortLevel`. The slider layers it as the top notch, gated on the model
// supporting xhigh and the Workflows feature not being disabled.

export const ULTRACODE_LABEL = 'Ultracode - xhigh + workflows';

/** The effort level ultracode pins (and the gate for its availability). */
export const ULTRACODE_EFFORT = 'xhigh';

export function isUltracodeAvailable(
  supported: string[],
  disableWorkflows: boolean | undefined,
): boolean {
  if (disableWorkflows === true) return false;
  return supported.includes(ULTRACODE_EFFORT);
}

export type EffortStep =
  | { kind: 'level'; key: string }
  | { kind: 'ultracode' };

/**
 * The next step when cycling effort with Shift+Tab / Enter. Mirrors the Cursor
 * extension: the steps are the supported levels plus, when available, a trailing
 * ultracode step. Wraps ultracode (or the last level) back to the first level.
 */
export function nextEffortStep(
  current: string | null | undefined,
  ultracodeEnabled: boolean,
  supported: string[],
  ultracodeAvailable: boolean,
): EffortStep {
  const count = supported.length + (ultracodeAvailable ? 1 : 0);
  if (count === 0) return { kind: 'level', key: '' };
  // ultracode occupies the last index; otherwise locate the current level
  // (unset/auto → -1 so it advances to the first level).
  const idx = ultracodeEnabled ? count - 1 : current ? supported.indexOf(current) : -1;
  const next = (idx + 1) % count;
  if (ultracodeAvailable && next === count - 1) return { kind: 'ultracode' };
  return { kind: 'level', key: supported[next] };
}

export interface ModelEffortConfig {
  supportsEffort: boolean;
  levels: string[];
}

/**
 * Resolve the current model's effort configuration from the CLI control
 * response. `currentModel` may be a precise list value (e.g. `opus[1m]`), a
 * coarse alias (`opus`), or a raw full model id — the same granularity mix
 * `resolveModelInfo` already handles for the model indicator, so this reuses
 * it rather than doing its own exact-only lookup.
 *
 * This matters in practice: the CLI's `value` for Opus with the 1M context
 * window is the suffixed `opus[1m]`, not the bare `opus` alias. An exact-match
 * lookup against that suffixed value missed it whenever `currentModel` was the
 * bare alias, silently reporting `supportsEffort: false` and hiding the effort
 * slider. `resolveModelInfo`'s alias-equivalence fallback fixes that.
 */
export function getModelEffortConfig(
  controlResponse: CliConfigControlResponse | null,
  currentModel: string | null | undefined,
): ModelEffortConfig {
  const models: ModelInfo[] = controlResponse?.response?.response?.models ?? [];
  const info = resolveModelInfo(models, currentModel);
  if (!info?.supportsEffort) return { supportsEffort: false, levels: [] };
  return { supportsEffort: true, levels: info.supportedEffortLevels ?? [] };
}
