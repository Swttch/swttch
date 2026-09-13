import { ModelInfo, DEFAULT_MODEL_ALIAS, alphanumericKey, toDisplayLabel } from './ModelInfo';
import { isAtLeastVersion } from '@/utils/compareVersions';

export { DEFAULT_MODEL_ALIAS, toDisplayLabel };
export type { ModelRowText } from './ModelInfo';

/**
 * Free-function views onto `ModelInfo`, kept so existing call sites (and the
 * CLI-echo helpers below, which work on strings rather than rows) keep reading
 * the same. Each one is a one-line delegation to the method that now owns the
 * logic; the reasoning lives in `ModelInfo.ts`.
 */
export function toModelAlias(value: string | null | undefined, description?: string | null): string {
  return ModelInfo.aliasOf(value, description);
}
export function modelInfoAlias(info: ModelInfo): string {
  return info.alias;
}
export function resolveModelLabel(info: ModelInfo): string {
  return info.label;
}
export function resolveModelRowText(info: ModelInfo): { title: string; blurb: string | undefined } {
  return info.rowText;
}

/**
 * Fable 5 support (issue #153).
 *
 * Fable 5 is now a permanent GA model, but whether the CLI lists it in the
 * `initialize` model catalog is decided per-account by the server
 * (`additionalModelOptionsCache` entitlement), NOT by CLI version — so many
 * accounts never see it in the picker even though `--model fable` activates it
 * fine. To honour CLI equivalence ("what works in the CLI works in the GUI")
 * we surface Fable as a fallback item when the account's catalog omits it,
 * gated on a real per-account availability probe (see `withFableFallback` /
 * `FableProbeContext`) rather than any promotional date window.
 */

/**
 * Minimum Claude Code CLI version that knows the Fable model (`--model fable`).
 * Fable landed in CLI 2.1.170; older CLIs don't recognise it, so we must not
 * surface a fallback they can't select.
 */
export const FABLE_MIN_CLI_VERSION = '2.1.170';

/** Whether the running CLI is new enough to select Fable. */
export function isFableSupportedCli(cliVersion: string | null | undefined): boolean {
  return isAtLeastVersion(cliVersion, FABLE_MIN_CLI_VERSION);
}

/**
 * Hardcoded Fable item appended only when the CLI-provided catalog lacks Fable.
 * `value: 'fable'` matches the verified `--model fable` / `set_model` path.
 *
 * **It carries no version number, on purpose.** This used to read "Fable 5 · …",
 * and that number went stale the moment the server moved the alias to Fable 5.1:
 * the picker kept saying "Fable 5" while `--model fable` ran `claude-fable-5-1`
 * (measured 2026-09-13 via `modelUsage.canonicalModel`). A version we write down
 * is a version we will be wrong about, because the server decides it and never
 * tells us here.
 *
 * "Fable" alone cannot go stale: `--model fable` means "the latest Fable" by the
 * CLI's own documented contract (`claude --help`), so the bare family name is
 * exactly as precise as what we are actually selecting. Once the account's
 * catalog serves Fable natively, this row is deduped away and the CLI's own
 * wording — version included — takes over.
 */
export const FABLE_FALLBACK_MODEL: ModelInfo = ModelInfo.from({
  value: 'fable',
  displayName: 'Fable',
  description: 'Most capable for your hardest and longest-running tasks',
});

/**
 * Augment the CLI's model list with a Fable fallback when the account's catalog
 * omits it — a merge, not a static override. If the CLI already lists Fable
 * (entitled account), that dynamic entry wins and the hardcoded item is skipped
 * via alias-based dedup, so this quietly no-ops once Fable is served natively.
 * A CLI-served Fable is always respected — the server, not us, decides
 * availability.
 *
 * Fable is now a permanent GA model, but the server still decides per-account
 * whether it appears in the `initialize` catalog: many accounts that can run
 * `--model fable` (on prepaid usage credits) never see it listed. There is no
 * date window to lean on anymore, so the only reliable signal for offering the
 * hardcoded fallback is a real per-account availability probe
 * (`probedAvailable === true`; see `fable-probe` / `FableProbeContext`).
 * `false` means the probe rejected this account and `null`/`undefined` means it
 * hasn't resolved yet — in both cases we do not offer the fallback, so a model
 * the account can't select never surfaces.
 *
 * The fallback is additionally gated on the CLI version: Fable landed in CLI
 * 2.1.170 (`FABLE_MIN_CLI_VERSION`), and older CLIs don't recognise
 * `--model fable`, so offering the fallback to them would surface a model the
 * user can't actually select. The "CLI already serves it" dedup check runs
 * BEFORE the version gate on purpose: an entitled account whose catalog carries
 * Fable is necessarily on a CLI new enough to serve it, so we always trust that
 * dynamic entry regardless of the parsed version string.
 *
 * An empty list is left untouched: length 0 means the CLI config hasn't loaded
 * yet, and consumers treat that as "loading" (hide the tag / show a spinner).
 * Injecting Fable there would defeat that, so only a loaded list is augmented.
 */
export function withFableFallback(
  models: ModelInfo[],
  cliVersion: string | null | undefined,
  probedAvailable?: boolean | null,
  /**
   * The id the probe saw the `fable` alias resolve to (`claude-fable-5-1`).
   * Attached to the row as `resolvedModel` so the label can state the version
   * without us hardcoding one. Absent until the probe answers, in which case
   * the row simply reads "Fable" — correct, just less specific.
   */
  probedCanonicalModel?: string | null,
): ModelInfo[] {
  if (models.length === 0) return models;
  if (models.some((m) => modelInfoAlias(m) === 'fable')) return models; // CLI already serves it — always trust, regardless of version (a custom catalog names it in the description)
  if (!isFableSupportedCli(cliVersion)) return models; // an old CLI can't select Fable, so don't offer the fallback
  if (probedAvailable !== true) return models; // only when a real probe confirmed this account
  // Fable 5 is the most capable model, so rank it at the top of the concrete
  // choices — just below the "default" item and above Opus/Sonnet/Haiku,
  // mirroring how the CLI orders a natively-served Fable ahead of them.
  const defaultIdx = models.findIndex((m) => m.value === DEFAULT_MODEL_ALIAS);
  const at = defaultIdx >= 0 ? defaultIdx + 1 : 0;
  const item = probedCanonicalModel
    ? FABLE_FALLBACK_MODEL.withResolvedModel(probedCanonicalModel)
    : FABLE_FALLBACK_MODEL;
  return [...models.slice(0, at), item, ...models.slice(at)];
}

/**
 * Decide what the session model becomes when the CLI reports the model it is
 * running (`system/init`).
 *
 * One rule: **an unidentifiable value must never overwrite one we already
 * know.** Model ids are not ours to predict — a proxy can map the CLI's slots
 * onto arbitrary names via `ANTHROPIC_DEFAULT_*_MODEL`, and a future catalog
 * may use shapes we've never seen. Previously an unmatched report was resolved
 * as "the default" downstream, which silently discarded the user's pick and
 * showed the wrong model even though the CLI was running the right one
 * (issue #217).
 *
 * So: adopt a report we can place in the catalog, adopt it when there is no
 * prior pick to protect (it is all we know), and otherwise keep what the user
 * chose — which also keeps subsequent requests going out with that model.
 *
 * An empty `models` list means the catalog hasn't loaded yet, not that nothing
 * matched; treat it as "can't judge" and keep the current pick.
 */
export function reconcileSessionModel(
  reported: string | null | undefined,
  current: string | null | undefined,
  models: ModelInfo[],
): string | null {
  if (!reported) return null; // the CLI reports no model — nothing to run with
  if (!current) return reported; // nothing to protect; keep the report verbatim
  if (models.length === 0) return current; // catalog not loaded — can't judge yet
  return resolveModelInfo(models, reported, { allowDefaultFallback: false })
    ? reported
    : current;
}

/**
 * The model to treat as "current" for display and selection. The running
 * session model (`systemInit` truth) wins once known; before the CLI is
 * spawned (new session, `sessionModel` null) we predict with the user's saved
 * default (`settings.model`); with neither set it's the default alias. This
 * mirrors the auto-mode availability check so the indicator and auto gating
 * never disagree.
 */
export function resolveCurrentModel(
  sessionModel: string | null | undefined,
  settingsModel: string | null | undefined,
): string {
  return sessionModel ?? settingsModel ?? DEFAULT_MODEL_ALIAS;
}

/**
 * Resolve the `ModelInfo` that best represents `current` within the CLI's
 * model list, with graceful fallbacks so the model indicator never vanishes.
 *
 * `current` may be a precise list value the user picked ("opusplan",
 * "sonnet[1m]"), a coarse alias the CLI handed back ("opus"), or even a raw
 * full model id ("claude-opus-4-1-20250805") forwarded from `system/init`.
 * The CLI's reported model and the selectable list use different granularity,
 * so an exact match alone is too brittle — when it misses we widen the search
 * rather than rendering nothing.
 *
 * Resolution order:
 *  1. exact `resolvedModel` — the concrete id the CLI reports as running
 *  2. exact `displayName` — a custom catalog puts its real id here
 *  3. exact `value` — preserves fine-grained user picks ("opusplan")
 *  4. alphanumeric containment — same id written in a different shape
 *  5. the `default` item — a sane visible fallback
 *  6. `null` — caller renders a raw label of last resort
 */
/**
 * Resolve a model the user *explicitly named* (e.g. "/model fable"), matching
 * only by exact value or model family — with NO default fallback. Unlike
 * `resolveModelInfo` (which always returns something so the indicator never
 * blanks), this returns null when the requested model isn't available, so
 * "/model fable" never silently switches to Opus/default when Fable is absent.
 */
export function findModelForSelection(
  models: ModelInfo[],
  query: string,
): ModelInfo | null {
  const exact = models.find((m) => m.value === query);
  if (exact) return exact;

  const alias = toModelAlias(query);
  // toModelAlias returns DEFAULT_MODEL_ALIAS for anything it doesn't recognise;
  // treat that as "no family match" (unless the user literally asked for the
  // default) so an unknown token can't map onto the default model.
  if (alias === DEFAULT_MODEL_ALIAS && query.toLowerCase() !== DEFAULT_MODEL_ALIAS) {
    return null;
  }
  return models.find((m) => modelInfoAlias(m) === alias) ?? null;
}

export function resolveModelInfo(
  models: ModelInfo[],
  current: string | null | undefined,
  options?: { allowDefaultFallback?: boolean },
): ModelInfo | null {
  if (models.length === 0) return null;
  const target = current ?? DEFAULT_MODEL_ALIAS;

  // The CLI selects a row by its `value` but reports the running model as the
  // concrete id that row resolved to, and the catalog carries that id on every
  // row it resolved. So `resolvedModel` is the precise thing to match on, and it
  // needs no guessing about id shapes — custom proxy catalogs included, whose ids
  // carry no family token to fall back on (issue #217).
  const resolved = models.find((m) => m.resolvedModel !== undefined && m.resolvedModel === target);
  if (resolved) return resolved;

  const byName = models.find((m) => m.displayName === target);
  if (byName) return byName;

  // An exact `value` before any loose comparison: "opusplan" contains "opus", so
  // a containment pass alone would hand back the coarser row and lose the
  // fine-grained pick the user actually made.
  const exactValue = models.find((m) => m.value === target);
  if (exactValue) return exactValue;

  // Last resort: one model is named in different shapes across sources
  // (`opus[1m]` vs `claude-opus-5[1m]`, `GLM-4.5-Air-MAYI` vs `glm-4.5-air-mayi`).
  // Comparing on letters and digits alone drops punctuation, case and suffixes,
  // and either side may be the longer form — so accept containment both ways.
  const targetKey = alphanumericKey(target);
  if (targetKey) {
    const contained = models.find((m) => {
      const valueKey = alphanumericKey(m.value);
      return valueKey !== '' && (targetKey.includes(valueKey) || valueKey.includes(targetKey));
    });
    if (contained) return contained;
  }

  // Callers that need to know whether the model was genuinely identified (see
  // `reconcileSessionModel`) opt out of this fallback: for them "unmatched"
  // must stay distinguishable from "matched the default row".
  if (options?.allowDefaultFallback === false) return null;

  const defaultItem = models.find((m) => m.value === DEFAULT_MODEL_ALIAS);
  if (defaultItem) return defaultItem;

  return null;
}

/**
 * Whether auto permission mode should be offered for the current model.
 *
 * The CLI gates auto on model, version, plan, provider and admin policy, then
 * surfaces the model dimension as `ModelInfo.supportsAutoMode` (true for
 * supported models, absent/false otherwise — e.g. Haiku). Admin policy is the
 * separate `permissions.disableAutoMode` setting. This is only a *prediction*
 * for whether to show the option; the real applied mode comes from
 * `system/init.permissionMode`.
 */
export function isAutoModeAvailable(
  models: ModelInfo[],
  currentModel: string | null | undefined,
  disableAutoMode: string | undefined,
): boolean {
  if (disableAutoMode === 'disable') return false;
  const info = resolveModelInfo(models, currentModel);
  return info?.supportsAutoMode === true;
}

/**
 * Resolve the model a CLI `/model` echo line refers to, against the account
 * catalog. Returns the model's stable `value` and a friendly `label`, or null
 * if the text isn't a model-change line. Accepts both "Set model to <id>" and
 * "Set model to <alias> (<id>)" shapes (and ignores any surrounding tags by
 * matching only from "Set model to" up to the first "(" or a tag/end).
 *
 * The `value` is locale-independent, so the CLI echo can be deduped against our
 * local (localized) model-change notification by comparing model identity — not
 * by display text, which differs per locale. When the token can't be resolved,
 * both `value` and `label` fall back to the raw token.
 */
export function modelChangeTarget(
  text: string,
  models: ModelInfo[],
): { value: string; label: string } | null {
  const raw = modelChangeToken(text);
  if (raw === null) return null;
  const info = resolveModelInfo(models, raw);
  // The label is spelled out from the id the echo NAMED, not borrowed from the
  // row it matched. Several rows can serve one id — "Default (recommended)" and
  // "Opus (1M context)" both resolve to `claude-opus-5[1m]` — and the default
  // row is the one `resolveModelInfo` finds first, so borrowing its name would
  // announce "set model to Default" for a pick the user made by name.
  return { value: info ? info.value : raw, label: toDisplayLabel(raw) };
}

/** The model token inside a CLI `/model` echo line, or null if it isn't one. */
function modelChangeToken(text: string): string | null {
  const match = text.match(/Set model to (.+?)(?:\s*[(<]|$)/);
  return match ? match[1].trim() : null;
}

/**
 * Whether a CLI `/model` echo line announces the row selected as `value`.
 *
 * Distinct from `modelChangeTarget`, which answers "which row is this?" and so
 * must pick ONE. The echo names the id the row resolved to, and several rows can
 * resolve to the same id — "Default (recommended)" and "Opus (1M context)" both
 * serve `claude-opus-5[1m]`, as do two slots of a proxy catalog pointed at one
 * model. Asking "is this row the one?" answers exactly what the caller knows it
 * needs, instead of making the resolver guess between rows it cannot separate.
 */
export function isModelChangeFor(
  text: string,
  value: string,
  models: ModelInfo[],
): boolean {
  const raw = modelChangeToken(text);
  if (raw === null) return false;
  if (raw === value) return true; // the echo named the row's own value
  const row = models.find((m) => m.value === value);
  if (row?.resolvedModel !== undefined && row.resolvedModel === raw) return true;
  // Neither side named the row directly — fall back to the shared resolver, so
  // an id written in another shape still converges (see `resolveModelInfo`).
  return resolveModelInfo(models, raw, { allowDefaultFallback: false })?.value === value;
}
