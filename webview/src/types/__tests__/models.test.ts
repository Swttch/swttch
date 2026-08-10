import { describe, it, expect } from 'vitest';
import {
  toModelAlias,
  reconcileSessionModel,
  resolveModelInfo,
  resolveModelLabel,
  findModelForSelection,
  modelChangeTarget,
  isModelChangeFor,
  isAutoModeAvailable,
  withFableFallback,
  resolveCurrentModel,
  FABLE_FALLBACK_MODEL,
  DEFAULT_MODEL_ALIAS,
} from '../models';
import type { ModelInfo } from '../slashCommand';

/**
 * A catalog row as the CLI actually serves it: every row it resolved carries a
 * `resolvedModel` alongside the `value` we hand back to select it. Tests that
 * need a row WITHOUT one (our Fable fallback, an unresolved row) build the
 * object literally instead of using this helper.
 */
function model(value: string, displayName = value, resolvedModel = `claude-${value}`): ModelInfo {
  return { value, resolvedModel, displayName, description: `${displayName} desc` };
}

function modelWithAuto(value: string, supportsAutoMode: boolean): ModelInfo {
  return { ...model(value), supportsAutoMode };
}

describe('findModelForSelection', () => {
  const models = [
    model('default', 'Default'),
    model('sonnet', 'Sonnet'),
    model('haiku', 'Haiku'),
    model('opus[1m]', 'Opus (1M)'),
  ];

  it('matches by exact value', () => {
    expect(findModelForSelection(models, 'sonnet')?.value).toBe('sonnet');
  });

  it('matches by model family alias', () => {
    expect(findModelForSelection(models, 'opus')?.value).toBe('opus[1m]');
  });

  it('returns null when the requested family is absent — does NOT fall back to default', () => {
    // Regression: "/model fable" must NOT silently switch to Opus/default when
    // Fable isn't in the list. autoSelect uses this instead of resolveModelInfo
    // (which falls back to default for display).
    expect(findModelForSelection(models, 'fable')).toBeNull();
  });

  it('matches fable when it is present', () => {
    const withFable = [...models, model('fable', 'Fable')];
    expect(findModelForSelection(withFable, 'fable')?.value).toBe('fable');
  });

  it('returns null for an unknown token', () => {
    expect(findModelForSelection(models, 'zzz')).toBeNull();
  });

  it('matches an explicit "default" request', () => {
    expect(findModelForSelection(models, 'default')?.value).toBe('default');
  });
});

describe('isAutoModeAvailable', () => {
  const models = [
    modelWithAuto('default', true),
    modelWithAuto('sonnet', true),
    { value: 'haiku', displayName: 'haiku', description: 'haiku desc' }, // supportsAutoMode absent (false)
  ];

  it('is true when the current model supports auto and policy allows it', () => {
    expect(isAutoModeAvailable(models, 'sonnet', undefined)).toBe(true);
    expect(isAutoModeAvailable(models, 'default', undefined)).toBe(true);
  });

  it('is false when the current model does not support auto', () => {
    expect(isAutoModeAvailable(models, 'haiku', undefined)).toBe(false);
  });

  it('is false when admin policy disables auto mode', () => {
    expect(isAutoModeAvailable(models, 'sonnet', 'disable')).toBe(false);
  });

  it('is false when no model info resolves (empty list)', () => {
    expect(isAutoModeAvailable([], 'sonnet', undefined)).toBe(false);
  });
});

describe('toModelAlias', () => {
  it('maps full model ids to a coarse alias', () => {
    expect(toModelAlias('claude-opus-4-1-20250805')).toBe('opus');
    expect(toModelAlias('claude-opus-5')).toBe('opus'); // Opus 5 collapses to the opus family
    expect(toModelAlias('claude-sonnet-4-5-20250929')).toBe('sonnet');
    expect(toModelAlias('claude-haiku-4-5')).toBe('haiku');
  });

  it('maps Fable 5 ids and aliases to the "fable" alias', () => {
    expect(toModelAlias('claude-fable-5')).toBe('fable');
    expect(toModelAlias('us.anthropic.claude-fable-5')).toBe('fable');
    expect(toModelAlias('fable')).toBe('fable');
    expect(toModelAlias('fable[1m]')).toBe('fable');
  });

  it('passes through short aliases', () => {
    expect(toModelAlias('opus')).toBe('opus');
    expect(toModelAlias('sonnet')).toBe('sonnet');
    expect(toModelAlias('fable')).toBe('fable');
    expect(toModelAlias('default')).toBe('default');
  });

  it('falls back to default for empty / unknown values', () => {
    expect(toModelAlias(null)).toBe('default');
    expect(toModelAlias(undefined)).toBe('default');
    expect(toModelAlias('')).toBe('default');
    expect(toModelAlias('mystery-model')).toBe('default');
  });
});

describe('reconcileSessionModel — never overwrite a known pick with an unknown value', () => {
  const CUSTOM: ModelInfo[] = [
    { value: 'default', displayName: 'Default (recommended)', description: 'Use the default model (currently glm-5.2-mayi[1m])' },
    { value: 'glm-4.5-air-mayi', displayName: 'glm-4.5-air-mayi', description: 'Custom Haiku model' },
  ];

  it('adopts a reported model the catalog recognizes', () => {
    expect(reconcileSessionModel('glm-4.5-air-mayi', 'default', CUSTOM)).toBe('glm-4.5-air-mayi');
  });

  it('keeps the current pick when the reported model is unrecognizable', () => {
    // The core rule: "we could not identify it" must never be read as
    // "it is the default". Whatever the user picked stays selected, so the next
    // request still goes out with that model (issue #217).
    expect(reconcileSessionModel('some-unknown-model-x', 'glm-4.5-air-mayi', CUSTOM)).toBe(
      'glm-4.5-air-mayi',
    );
  });

  it('adopts the reported model when there is no current pick to protect', () => {
    // Nothing to preserve — the reported value is all we know, so keep it
    // verbatim rather than inventing a fallback.
    expect(reconcileSessionModel('some-unknown-model-x', null, CUSTOM)).toBe('some-unknown-model-x');
  });

  it('keeps the current pick while the catalog is still loading', () => {
    // An empty catalog means "not loaded yet", not "nothing matches" — so it
    // must not be treated as a failed match that discards the pick.
    expect(reconcileSessionModel('glm-4.5-air-mayi', 'glm-4.5-air-mayi', [])).toBe('glm-4.5-air-mayi');
  });

  it('clears the model when the CLI reports none', () => {
    expect(reconcileSessionModel(null, 'glm-4.5-air-mayi', CUSTOM)).toBeNull();
  });

  it('is unaffected on an Anthropic catalog (no regression)', () => {
    const anthropic: ModelInfo[] = [
      { value: 'default', displayName: 'Default (recommended)', description: 'Opus 4.8 · recommended' },
      { value: 'haiku', displayName: 'Haiku', description: 'Haiku 4.5 · fast' },
    ];
    expect(reconcileSessionModel('claude-haiku-4-5-20251001', 'default', anthropic)).toBe(
      'claude-haiku-4-5-20251001',
    );
  });
});

describe('custom model catalogs (issue #217)', () => {
  // A third-party proxy (GLM here) maps the CLI's model slots to its own ids via
  // ANTHROPIC_DEFAULT_*_MODEL. The values carry no "opus"/"sonnet"/"haiku"
  // token, so value-only alias matching collapses every entry onto "default" —
  // the indicator then shows the default row's blurb no matter what is running.
  // The CLI still tells us the family in the description ("Custom Haiku model"),
  // so that is what we key on.
  const CUSTOM_MODELS: ModelInfo[] = [
    {
      value: 'default',
      resolvedModel: 'glm-5.2-mayi[1m]',
      displayName: 'Default (recommended)',
      description: 'Use the default model (currently glm-5.2-mayi[1m])',
    },
    { value: 'glm-5.2-mayi', resolvedModel: 'glm-5.2-mayi', displayName: 'glm-5.2-mayi', description: 'Custom Opus model' },
    { value: 'glm-5.1-mayi', resolvedModel: 'glm-5.1-mayi', displayName: 'glm-5.1-mayi', description: 'Custom Fable model' },
    { value: 'glm-4.7-mayi', resolvedModel: 'glm-4.7-mayi', displayName: 'glm-4.7-mayi', description: 'Custom Sonnet model' },
    { value: 'glm-4.5-air-mayi', resolvedModel: 'glm-4.5-air-mayi', displayName: 'glm-4.5-air-mayi', description: 'Custom Haiku model' },
  ];

  it('derives the family from the description when the value carries no family token', () => {
    expect(toModelAlias('glm-4.5-air-mayi', 'Custom Haiku model')).toBe('haiku');
    expect(toModelAlias('glm-4.7-mayi', 'Custom Sonnet model')).toBe('sonnet');
    expect(toModelAlias('glm-5.2-mayi', 'Custom Opus model')).toBe('opus');
    expect(toModelAlias('glm-5.1-mayi', 'Custom Fable model')).toBe('fable');
  });

  it('still prefers the value over the description when the value is conclusive', () => {
    // The value is the stronger signal; a mismatched description must not win.
    expect(toModelAlias('claude-opus-4-8', 'Custom Haiku model')).toBe('opus');
  });

  it('leaves the default row on the default alias', () => {
    expect(toModelAlias('default', 'Use the default model (currently glm-5.2-mayi[1m])')).toBe(
      DEFAULT_MODEL_ALIAS,
    );
  });

  it('keeps a user-picked custom model displayed after the session starts', () => {
    // Regression for #217: the user picks the Haiku slot and sends a message;
    // system/init echoes the id that slot resolved to, which must land back on
    // the very row the user picked — not on the "default" row.
    expect(resolveModelInfo(CUSTOM_MODELS, 'glm-4.5-air-mayi')?.value).toBe('glm-4.5-air-mayi');
    expect(resolveModelInfo(CUSTOM_MODELS, 'glm-4.7-mayi')?.value).toBe('glm-4.7-mayi');
  });

  it('does not put a coarse alias on an arbitrary row of that family', () => {
    // A proxy catalog can map ONE id onto two slots ("Custom Sonnet model" and
    // "Custom Haiku model" both serving it), so picking a row by the family
    // named in its blurb picks whichever comes first — a guess, not a match.
    // Better to identify nothing than to tick a row we cannot justify.
    expect(resolveModelInfo(CUSTOM_MODELS, 'haiku', { allowDefaultFallback: false })).toBeNull();
  });

  it('resolves the raw custom id the CLI may echo back, suffix and case included', () => {
    expect(resolveModelInfo(CUSTOM_MODELS, 'glm-4.5-air-mayi')?.value).toBe('glm-4.5-air-mayi');
    expect(resolveModelInfo(CUSTOM_MODELS, 'glm-4.5-air-mayi[1m]')?.value).toBe('glm-4.5-air-mayi');
    expect(resolveModelInfo(CUSTOM_MODELS, 'GLM-4.5-Air-MAYI')?.value).toBe('glm-4.5-air-mayi');
  });

  it('labels a custom model by its own name rather than the default blurb', () => {
    const haiku = CUSTOM_MODELS[4];
    // Never the long "Use the default model (currently …)" sentence that broke
    // the composer's bottom row.
    expect(resolveModelLabel(haiku)).toBe('glm-4.5-air-mayi');
  });

  it('does not fabricate a family for a genuinely unknown custom model', () => {
    // No family token anywhere → stay on default rather than guessing.
    expect(toModelAlias('glm-4.5-air-mayi', 'Some unrelated blurb')).toBe(DEFAULT_MODEL_ALIAS);
  });
});

describe('resolveModelLabel', () => {
  it('extracts the model name + version from the description (e.g. "Opus 5")', () => {
    // Opus 5 arrives purely via the CLI catalog; the label must resolve to
    // "Opus 5" from the description's first "·" segment, dropping the qualifier.
    const opus5: ModelInfo = {
      value: 'opus[1m]',
      displayName: 'Opus (1M context)',
      description: 'Opus 5 with 1M context · Best for everyday, complex tasks',
    };
    expect(resolveModelLabel(opus5)).toBe('Opus 5');
  });

  it('extracts "Fable 5" from the hardcoded fallback description', () => {
    expect(resolveModelLabel(FABLE_FALLBACK_MODEL)).toBe('Fable 5');
  });
});

describe('resolveModelInfo', () => {
  const opus = model('opus', 'Opus');
  const opusplan = model('opusplan', 'Opus Plan');
  const sonnet = model('sonnet', 'Sonnet');
  const def = model('default', 'Default (recommended)');

  it('returns the exact-match item when value matches', () => {
    const models = [def, sonnet, opus];
    expect(resolveModelInfo(models, 'opus')).toBe(opus);
  });

  it('falls back to alias-equivalence when no exact match exists', () => {
    // current "opus" but only "opusplan" present → both reduce to alias "opus"
    const models = [def, sonnet, opusplan];
    expect(resolveModelInfo(models, 'opus')).toBe(opusplan);
  });

  it('resolves a raw full model id against alias-equivalent list values', () => {
    // systemInit may hand us a full id; it must still resolve
    const models = [def, sonnet, opus];
    expect(resolveModelInfo(models, 'claude-opus-4-1-20250805')).toBe(opus);
  });

  it('falls back to the default item when neither exact nor alias matches', () => {
    // current "opus" with no opus-family item at all → default item
    const models = [def, sonnet];
    expect(resolveModelInfo(models, 'opus')).toBe(def);
  });

  it('returns null only when nothing — not even default — can be resolved', () => {
    const models = [sonnet];
    expect(resolveModelInfo(models, 'opus')).toBeNull();
  });

  it('returns null for an empty model list', () => {
    expect(resolveModelInfo([], 'opus')).toBeNull();
  });

  it('treats a null current as the default alias', () => {
    const models = [def, sonnet, opus];
    expect(resolveModelInfo(models, null)).toBe(def);
  });

  it('does not lose a user-picked fine-grained model to alias collapse', () => {
    // user picked "opusplan"; exact match must win over plain "opus"
    const models = [def, opus, opusplan];
    expect(resolveModelInfo(models, 'opusplan')).toBe(opusplan);
  });
});

describe('modelChangeTarget', () => {
  const models: ModelInfo[] = [
    { value: 'default', resolvedModel: 'claude-opus-4-8[1m]', displayName: 'Default (recommended)', description: 'Opus 4.8 with 1M context · recommended' },
    { value: 'opus[1m]', resolvedModel: 'claude-opus-4-8[1m]', displayName: 'Opus', description: 'Opus 4.8 with 1M context · best for hard tasks' },
    { value: 'sonnet', resolvedModel: 'claude-sonnet-4-6', displayName: 'Sonnet', description: 'Sonnet 4.6 · everyday' },
    { value: 'haiku', resolvedModel: 'claude-haiku-4-5-20251001', displayName: 'Haiku', description: 'Haiku 4.5 · fast' },
  ];

  it('resolves "Set model to <full id>" to a friendly label', () => {
    // The CLI echoes the bare id. Two rows here serve that id — "Default
    // (recommended)" and "Opus" — exactly as the real catalog does, so only the
    // label is well-defined; both rows carry the same one. Which row got picked
    // is the caller's business, and the caller that cares asks
    // `isModelChangeFor` instead (see below).
    expect(modelChangeTarget('Set model to claude-opus-4-8[1m]', models)?.label).toBe('Opus 4.8');
  });

  it('resolves "Set model to <alias> (<id>)" by the alias before the paren', () => {
    expect(modelChangeTarget('Set model to sonnet (claude-sonnet-4-6)', models)).toEqual({
      value: 'sonnet',
      label: 'Sonnet 4.6',
    });
    expect(modelChangeTarget('Set model to haiku (claude-haiku-4-5-20251001)', models)).toEqual({
      value: 'haiku',
      label: 'Haiku 4.5',
    });
  });

  it('still parses when wrapped in a local-command-stdout tag', () => {
    expect(
      modelChangeTarget('<local-command-stdout>Set model to claude-opus-4-8[1m]</local-command-stdout>', models)?.label,
    ).toBe('Opus 4.8');
  });

  it('returns null for text that is not a model-change line', () => {
    expect(modelChangeTarget('hello world', models)).toBeNull();
    expect(modelChangeTarget('', models)).toBeNull();
  });

  it('falls back to the raw token (value and label) when the model is unknown', () => {
    expect(modelChangeTarget('Set model to mystery', [])).toEqual({ value: 'mystery', label: 'mystery' });
  });
});

describe('isModelChangeFor', () => {
  // Mirrors the real catalog: "default" and "opus[1m]" serve one model id.
  const models: ModelInfo[] = [
    { value: 'default', resolvedModel: 'claude-opus-4-8[1m]', displayName: 'Default (recommended)', description: 'Opus 4.8 with 1M context · recommended' },
    { value: 'opus[1m]', resolvedModel: 'claude-opus-4-8[1m]', displayName: 'Opus', description: 'Opus 4.8 with 1M context · best for hard tasks' },
    { value: 'sonnet', resolvedModel: 'claude-sonnet-4-6', displayName: 'Sonnet', description: 'Sonnet 4.6 · everyday' },
  ];

  it('matches every row the echoed id resolves to, not just the first one', () => {
    // Whichever of the two the user picked, the echo announces their change —
    // so the local notice for that row must recognize it and step aside.
    expect(isModelChangeFor('Set model to claude-opus-4-8[1m]', 'opus[1m]', models)).toBe(true);
    expect(isModelChangeFor('Set model to claude-opus-4-8[1m]', 'default', models)).toBe(true);
  });

  it('does not match a row serving a different model', () => {
    expect(isModelChangeFor('Set model to claude-opus-4-8[1m]', 'sonnet', models)).toBe(false);
  });

  it('matches when the echo names the row value itself', () => {
    expect(isModelChangeFor('Set model to sonnet (claude-sonnet-4-6)', 'sonnet', models)).toBe(true);
  });

  it('matches an unknown model against the raw token, so a proxy model still dedupes', () => {
    expect(isModelChangeFor('Set model to my-proxy-model', 'my-proxy-model', [])).toBe(true);
  });

  it('is false for text that is not a model-change line', () => {
    expect(isModelChangeFor('hello world', 'sonnet', models)).toBe(false);
  });
});

describe('withFableFallback', () => {
  const def = model('default', 'Default (recommended)');
  const opus = model('opus', 'Opus');
  // A CLI version new enough to select Fable (>= 2.1.170).
  const SUPPORTED_CLI = '2.1.170';

  it('inserts the hardcoded Fable item when a probe confirms and the list lacks Fable', () => {
    const merged = withFableFallback([def, opus], SUPPORTED_CLI, true);
    expect(merged).toHaveLength(3);
    // Fable ranks just below "default" and above Opus (index 1), not appended last.
    expect(merged[1]).toBe(FABLE_FALLBACK_MODEL);
    expect(merged[1].value).toBe('fable');
    // Verbatim CLI structure: short displayName + "Fable 5 · …" description so
    // resolveModelLabel can extract "Fable 5" as the label.
    expect(merged[1].displayName).toBe('Fable');
    expect(resolveModelLabel(merged[1])).toBe('Fable 5');
  });

  it('ranks Fable just below the default item and above the other models', () => {
    const sonnet = model('sonnet', 'Sonnet');
    const merged = withFableFallback([def, opus, sonnet], SUPPORTED_CLI, true);
    expect(merged.map((m) => m.value)).toEqual(['default', 'fable', 'opus', 'sonnet']);
  });

  it('places Fable first when there is no default item', () => {
    const merged = withFableFallback([opus], SUPPORTED_CLI, true);
    expect(merged.map((m) => m.value)).toEqual(['fable', 'opus']);
  });

  it('does not append when a "fable" alias item is already present (dedup)', () => {
    const cliFable = model('fable', 'Fable 5');
    const merged = withFableFallback([def, cliFable], SUPPORTED_CLI, true);
    expect(merged).toHaveLength(2);
    expect(merged).toEqual([def, cliFable]);
  });

  it('dedups against a full Fable model id the CLI may hand back', () => {
    const cliFable = model('claude-fable-5', 'Fable 5');
    const merged = withFableFallback([def, cliFable], SUPPORTED_CLI, true);
    expect(merged).toHaveLength(2);
    expect(merged.some((m) => m === FABLE_FALLBACK_MODEL)).toBe(false);
  });

  it('leaves an empty list untouched so "loading" state is preserved', () => {
    // An empty list means the CLI config has not arrived yet; consumers treat
    // length 0 as "loading" (hide the tag / show a spinner). Injecting Fable
    // there would break that, so the fallback only augments a loaded list.
    expect(withFableFallback([], SUPPORTED_CLI, true)).toEqual([]);
  });

  it('does not inject the fallback when no probe has run (undefined)', () => {
    // Availability is per-account and there is no date window anymore; without a
    // confirming probe (probedAvailable omitted) we must not surface Fable.
    const merged = withFableFallback([def, opus], SUPPORTED_CLI);
    expect(merged).toEqual([def, opus]);
  });

  it('offers the fallback when a probe confirms availability', () => {
    // The probe made a real `--model fable` call and it succeeded for this
    // account, so we offer Fable.
    const merged = withFableFallback([def, opus], SUPPORTED_CLI, true);
    expect(merged).toHaveLength(3);
    expect(merged[1]).toBe(FABLE_FALLBACK_MODEL);
  });

  it('does not append when the probe says unavailable', () => {
    const merged = withFableFallback([def, opus], SUPPORTED_CLI, false);
    expect(merged).toEqual([def, opus]);
  });

  it('ignores a pending probe (null)', () => {
    // null = probe not resolved yet; stay conservative until it lands.
    const merged = withFableFallback([def, opus], SUPPORTED_CLI, null);
    expect(merged).toEqual([def, opus]);
  });

  it('does not append even if probed available when the CLI is too old', () => {
    // The version gate runs before the probe check: an old CLI can't select
    // Fable regardless of what the probe reported.
    const merged = withFableFallback([def, opus], '2.1.169', true);
    expect(merged).toEqual([def, opus]);
  });

  it('still respects a CLI-served Fable entry regardless of probe (server decides)', () => {
    // If the account's catalog carries Fable, it stays — the server, not us,
    // decides availability; no probe needed.
    const cliFable = model('fable', 'Fable 5');
    const merged = withFableFallback([def, cliFable], SUPPORTED_CLI);
    expect(merged).toEqual([def, cliFable]);
  });

  it('does not append the fallback when the CLI is too old to select Fable', () => {
    // CLI 2.1.169 < 2.1.170: it doesn't know `--model fable`, so offering the
    // hardcoded fallback would surface a model the user can't actually select.
    const merged = withFableFallback([def, opus], '2.1.169', true);
    expect(merged).toEqual([def, opus]);
    expect(merged.some((m) => toModelAlias(m.value) === 'fable')).toBe(false);
  });

  it('does not append the fallback when the CLI version is unknown (null)', () => {
    // A null version means we can't confirm Fable support; stay conservative.
    const merged = withFableFallback([def, opus], null, true);
    expect(merged).toEqual([def, opus]);
  });

  it('offers the fallback when the CLI is exactly at the minimum version', () => {
    // 2.1.170 is the first CLI that knows Fable — inclusive threshold.
    const merged = withFableFallback([def, opus], '2.1.170', true);
    expect(merged).toHaveLength(3);
    expect(merged[1]).toBe(FABLE_FALLBACK_MODEL);
  });

  it('keeps a CLI-served Fable even on an old CLI (dedup wins over version gate)', () => {
    // If the catalog already carries Fable, that dynamic entry is trusted
    // regardless of the parsed version — the dedup check runs first.
    const cliFable = model('fable', 'Fable 5');
    const merged = withFableFallback([def, cliFable], '2.1.100');
    expect(merged).toEqual([def, cliFable]);
  });
});

describe('resolveCurrentModel', () => {
  it('prefers the running session model (systemInit truth)', () => {
    // Even if settings say fable, the actually-running model wins once known.
    expect(resolveCurrentModel('opus', 'fable')).toBe('opus');
  });

  it('falls back to the settings model before send (new session prediction)', () => {
    // No CLI spawned yet (sessionModel null) → show the user's default choice.
    expect(resolveCurrentModel(null, 'fable')).toBe('fable');
  });

  it('falls back to the default alias when neither is set', () => {
    expect(resolveCurrentModel(null, null)).toBe(DEFAULT_MODEL_ALIAS);
    expect(resolveCurrentModel(undefined, undefined)).toBe(DEFAULT_MODEL_ALIAS);
  });
});

describe('DEFAULT_MODEL_ALIAS', () => {
  it('is "default"', () => {
    expect(DEFAULT_MODEL_ALIAS).toBe('default');
  });
});
