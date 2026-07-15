import type { ModelInfo } from './slashCommand';
import { isAtLeastVersion } from '@/utils/compareVersions';

/**
 * CLI model alias ("default", "opus", "sonnet", "haiku", "fable") used by the
 * Claude Code CLI as the short form of `ModelInfo.value` in the
 * initialize control_response. Full model IDs such as
 * `claude-opus-4-7[1m]` or `claude-fable-5` are mapped to one of these
 * aliases via `toModelAlias`.
 */
export const DEFAULT_MODEL_ALIAS = 'default';

export function toModelAlias(value: string | null | undefined): string {
  if (!value) return DEFAULT_MODEL_ALIAS;
  if (value === DEFAULT_MODEL_ALIAS) return DEFAULT_MODEL_ALIAS;
  if (value === 'opus' || value === 'sonnet' || value === 'haiku' || value === 'fable') return value;
  if (value.includes('opus')) return 'opus';
  if (value.includes('sonnet')) return 'sonnet';
  if (value.includes('haiku')) return 'haiku';
  if (value.includes('fable')) return 'fable';
  return DEFAULT_MODEL_ALIAS;
}

/**
 * Fable 5 support (issue #153).
 *
 * Fable 5 is a limited-window promotional model. Whether the CLI lists it in
 * the `initialize` model catalog is decided per-account by the server
 * (`additionalModelOptionsCache` entitlement), NOT by CLI version — so many
 * accounts never see it in the picker even though `--model fable` activates it
 * fine. To honour CLI equivalence ("what works in the CLI works in the GUI")
 * we surface Fable as a fallback item when the account's catalog omits it.
 *
 * `FABLE_PROMO_END` is the public promotion window end. It gates the "included
 * until" badge (rendered from the `fableNotice.promoBadge` i18n string) and,
 * while the window is open, lets us offer the fallback without a probe. It is
 * NOT the post-window gate: once the date passes, whether we keep offering Fable
 * is decided by a real per-account availability probe (see `withFableFallback`),
 * because Fable keeps working via `--model fable` (on prepaid credits) for many
 * accounts even after inclusion ends.
 *
 * Anthropic has extended the subscription-inclusion cutoff twice: 2026-07-07 →
 * 2026-07-12 → 2026-07-19 (after which Fable moves to prepaid usage credits
 * rather than being retired). The badge/date text is server-supplied per
 * account, not baked into the CLI binary, so we mirror the publicly announced
 * date here. When the window shifts again, update this date AND the
 * `fableNotice.promoBadge` string in every locale so the two agree.
 * TODO(after 2026-07-19): revisit the badge/announcement copy once Fable's
 * post-promo availability settles (the fallback itself is now probe-driven).
 */
export const FABLE_PROMO_END = '2026-07-19';

/**
 * Whether the Fable promotion window is still open on `now` (inclusive of the
 * end day). ISO date strings compare lexicographically in calendar order, so a
 * simple prefix compare against `FABLE_PROMO_END` suffices.
 */
export function isFablePromoActive(now: Date): boolean {
  return now.toISOString().slice(0, 10) <= FABLE_PROMO_END;
}

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
 * Structure mirrors the CLI's own rows verbatim — `displayName: 'Fable'` (the
 * short name) and `description: 'Fable 5 · …'` (name+version, then blurb). The
 * leading "Fable 5 ·" matters: `resolveModelLabel` reads the model label out of
 * the description's first "·" segment, so without it the label degrades to the
 * full blurb ("Most capable for your…") instead of "Fable 5".
 */
export const FABLE_FALLBACK_MODEL: ModelInfo = {
  value: 'fable',
  displayName: 'Fable',
  description: 'Fable 5 · Most capable for your hardest and longest-running tasks',
};

/**
 * Augment the CLI's model list with a Fable fallback when the account's catalog
 * omits it — a merge, not a static override. If the CLI already lists Fable
 * (entitled account), that dynamic entry wins and the hardcoded item is skipped
 * via alias-based dedup, so this quietly no-ops once Fable is served natively.
 * A CLI-served Fable is respected regardless of the promo window — the server,
 * not us, decides post-promo availability.
 *
 * The hardcoded fallback's promo gate is two-phase. During the public promo
 * window (`isFablePromoActive`) Fable is broadly included, so we offer the
 * fallback without proof. Once the window ends, inclusion turns per-account and
 * the catalog still omits it for many accounts that CAN nonetheless run
 * `--model fable` — so we keep offering the fallback only when a real
 * availability probe has confirmed THIS account (`probedAvailable === true`).
 * `null`/`undefined` means the probe hasn't resolved yet (don't offer this open).
 * The date (`FABLE_PROMO_END`) is retained for the notice/badge copy, NOT as the
 * post-window gate.
 *
 * The hardcoded fallback is additionally gated on the CLI version: Fable landed
 * in CLI 2.1.170 (`FABLE_MIN_CLI_VERSION`), and older CLIs don't recognise
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
  now: Date,
  cliVersion: string | null | undefined,
  probedAvailable?: boolean | null,
): ModelInfo[] {
  if (models.length === 0) return models;
  if (models.some((m) => toModelAlias(m.value) === 'fable')) return models; // CLI already serves it — always trust, regardless of version
  if (!isFableSupportedCli(cliVersion)) return models; // an old CLI can't select Fable, so don't offer the fallback
  if (isFablePromoActive(now)) return [...models, FABLE_FALLBACK_MODEL]; // promo window: broadly included, offer without a probe
  if (probedAvailable === true) return [...models, FABLE_FALLBACK_MODEL]; // past window: only if a real probe confirmed this account
  return models;
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
 * Resolve the label to show for a model. The CLI's displayName hides the
 * real model behind generic labels ("Default (recommended)", "Sonnet"),
 * but the description's first "·"-separated segment carries the actual
 * model, e.g. "Opus 4.8 with 1M context · Best for everyday tasks".
 * Keep only the model name + version ("Opus 4.8"), dropping trailing
 * qualifiers; fall back to the full segment, then to displayName.
 */
export function resolveModelLabel(info: ModelInfo): string {
  const firstSegment = info.description?.split('·')[0]?.trim();
  if (!firstSegment) return info.displayName;
  const nameVersion = firstSegment.match(/^.+?\s[\d.]+/);
  return nameVersion ? nameVersion[0].trim() : firstSegment;
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
 *  1. exact `value` match — preserves fine-grained user picks
 *  2. alias-equivalence — same model family via `toModelAlias`
 *  3. the `default` item — a sane visible fallback
 *  4. `null` — caller renders a raw label of last resort
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
  return models.find((m) => toModelAlias(m.value) === alias) ?? null;
}

export function resolveModelInfo(
  models: ModelInfo[],
  current: string | null | undefined,
): ModelInfo | null {
  if (models.length === 0) return null;
  const target = current ?? DEFAULT_MODEL_ALIAS;

  const exact = models.find((m) => m.value === target);
  if (exact) return exact;

  const targetAlias = toModelAlias(target);
  const aliasMatch = models.find((m) => toModelAlias(m.value) === targetAlias);
  if (aliasMatch) return aliasMatch;

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
  const match = text.match(/Set model to (.+?)(?:\s*[(<]|$)/);
  if (!match) return null;
  const raw = match[1].trim();
  const info = resolveModelInfo(models, raw);
  return info ? { value: info.value, label: resolveModelLabel(info) } : { value: raw, label: raw };
}
