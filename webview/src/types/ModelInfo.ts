/**
 * One row of the CLI's model catalog, as an instance rather than a bag of fields.
 *
 * The catalog arrives as JSON from `initialize`, and everything the UI wants to
 * know about a row ("what do I call this?", "does this row name the model it
 * actually runs?") is a question about that row. Those used to be free functions
 * taking the row as their first argument, which is the shape of a method.
 *
 * ## The raw entry is kept whole
 *
 * The instance holds the CLI's object verbatim and reads through to it. It does
 * NOT copy the fields it knows about, because that would silently drop any field
 * a future CLI adds — exactly the "we decided what matters" edit the project's
 * original-data rule forbids. `toJSON` hands the untouched original back, so a
 * round trip through this class changes nothing.
 */

/**
 * CLI model alias used by the Claude Code CLI as the short form of
 * `ModelInfo.value` in the initialize control_response. Full model IDs such as
 * `claude-opus-4-7[1m]` or `claude-fable-5` map onto one of these.
 */
export const DEFAULT_MODEL_ALIAS = 'default';

/** The concrete model families the CLI exposes as short aliases. */
const MODEL_FAMILIES = ['opus', 'sonnet', 'haiku', 'fable'] as const;

/** First family token appearing in `text` (case-insensitive), if any. */
function familyIn(text: string): string | null {
  const haystack = text.toLowerCase();
  return MODEL_FAMILIES.find((family) => haystack.includes(family)) ?? null;
}

/**
 * Reduce a model id to letters and digits, lowercased. One model is named in
 * different shapes across sources (`opus[1m]` vs `claude-opus-5[1m]`,
 * `GLM-4.5-Air-MAYI` vs `glm-4.5-air-mayi`), so a comparison of last resort keys
 * on this rather than on the raw strings.
 */
export function alphanumericKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Whether two strings name the same model, ignoring case, punctuation and suffixes. */
export function namesSameModel(a: string, b: string): boolean {
  const ka = alphanumericKey(a);
  const kb = alphanumericKey(b);
  if (!ka || !kb) return false;
  return ka.includes(kb) || kb.includes(ka);
}

/**
 * A model id written for the screen.
 *
 * The spelling rules, applied to whatever id we are given:
 *  - the `claude-` vendor prefix is dropped
 *  - hyphens become spaces and each word is capitalised
 *  - consecutive number parts join with dots, so a version reads as one thing
 *  - a run of four or more digits is a dated snapshot and goes in parentheses
 *  - a bracketed suffix becomes parenthesised and uppercase
 *
 * ```
 * claude-opus-5[1m]          ->  Opus 5 (1M)
 * claude-fable-5-1           ->  Fable 5.1
 * claude-haiku-4-5-20251001  ->  Haiku 4.5 (20251001)
 * glm-4.5-air                ->  Glm 4.5 Air
 * glm-4.6[1m]                ->  Glm 4.6 (1M)
 * fable                      ->  Fable
 * ```
 *
 * It knows nothing about which vendor an id belongs to or which versions exist,
 * so a family, a version or a provider we have never seen comes out in the same
 * shape as the ones we have. That is the point: the only thing written down
 * here is the spelling rule, never a model.
 */
export function toDisplayLabel(id: string): string {
  const bracketed = id.match(/^(.*?)\[([^\]]+)\]\s*$/);
  const suffix = bracketed ? bracketed[2] : null;
  const base = (bracketed ? bracketed[1] : id).replace(/^claude-/i, '');

  const words: string[] = [];
  const dated: string[] = [];
  let version: string[] = [];
  const flushVersion = () => {
    if (version.length) {
      words.push(version.join('.'));
      version = [];
    }
  };

  for (const token of base.split('-').filter(Boolean)) {
    // Checked before the general number case: a dated snapshot is digits too,
    // and reading it as a version part would yield "Haiku 4.5.20251001".
    if (/^\d{4,}$/.test(token)) {
      flushVersion();
      dated.push(token);
      continue;
    }
    if (/^[\d.]+$/.test(token)) {
      version.push(token);
      continue;
    }
    flushVersion();
    words.push(token.charAt(0).toUpperCase() + token.slice(1));
  }
  flushVersion();

  const parenthesised = [...dated, ...(suffix ? [suffix.toUpperCase()] : [])];
  return [words.join(' '), ...parenthesised.map((p) => `(${p})`)].filter(Boolean).join(' ');
}

/** The two lines a picker row shows. */
export interface ModelRowText {
  title: string;
  blurb: string | undefined;
}

export class ModelInfo {
  private constructor(private readonly raw: Readonly<Record<string, unknown>>) {}

  /** Wrap one catalog entry. Anything unusable becomes an empty row rather than a throw. */
  static from(raw: unknown): ModelInfo {
    return new ModelInfo(
      raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {},
    );
  }

  /** Wrap a catalog. A non-array (absent config, error payload) yields no rows. */
  static fromList(raw: unknown): ModelInfo[] {
    return Array.isArray(raw) ? raw.map((entry) => ModelInfo.from(entry)) : [];
  }

  /**
   * Reduce a model value to its coarse family alias.
   *
   * `description` is consulted only when the value itself carries no family
   * token. Third-party proxies map the CLI's model slots onto their own ids via
   * `ANTHROPIC_DEFAULT_*_MODEL`, so the value can be something like
   * `glm-4.5-air-mayi` with no "haiku" in it, while the CLI still names the slot
   * in the description ("Custom Haiku model"). Without that second look every
   * custom entry collapses onto `default` (issue #217).
   *
   * The value stays the stronger signal: a description is only a tie-breaker for
   * values we can't classify, never an override.
   */
  static aliasOf(value: string | null | undefined, description?: string | null): string {
    if (!value) return DEFAULT_MODEL_ALIAS;
    if (value === DEFAULT_MODEL_ALIAS) return DEFAULT_MODEL_ALIAS;
    const fromValue = familyIn(value);
    if (fromValue) return fromValue;
    return (description && familyIn(description)) || DEFAULT_MODEL_ALIAS;
  }

  private str(key: string): string | undefined {
    const v = this.raw[key];
    return typeof v === 'string' ? v : undefined;
  }

  private bool(key: string): boolean | undefined {
    const v = this.raw[key];
    return typeof v === 'boolean' ? v : undefined;
  }

  get value(): string { return this.str('value') ?? ''; }

  /**
   * The concrete model this row resolves to, as the CLI reports it
   * (`claude-haiku-4-5-20251001`). `value` is what we hand back to select the
   * row; this is what the CLI echoes as the running model on `system/init`.
   * Absent on rows the CLI did not resolve (our Fable fallback row).
   */
  get resolvedModel(): string | undefined { return this.str('resolvedModel'); }

  get displayName(): string { return this.str('displayName') ?? ''; }
  get description(): string { return this.str('description') ?? ''; }
  get supportsEffort(): boolean | undefined { return this.bool('supportsEffort'); }
  get supportsAdaptiveThinking(): boolean | undefined { return this.bool('supportsAdaptiveThinking'); }
  get supportsFastMode(): boolean | undefined { return this.bool('supportsFastMode'); }
  get supportsAutoMode(): boolean | undefined { return this.bool('supportsAutoMode'); }

  get supportedEffortLevels(): string[] | undefined {
    const v = this.raw.supportedEffortLevels;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : undefined;
  }

  /** This row's coarse family, with its description considered. */
  get alias(): string {
    return ModelInfo.aliasOf(this.value, this.description);
  }

  /** Whether this is the "use whatever the default is" row. */
  get isDefaultRow(): boolean {
    return this.value === DEFAULT_MODEL_ALIAS;
  }

  /**
   * This row's own name.
   *
   * It answers "what is this row called", which is what the model picker's rows
   * and the settings dropdown ask. Screens that ask a different question do not
   * use it: the composer's chip asks which model is *running* and the chat's
   * model-change line asks what was *picked*, and both spell the `default` row
   * out differently (see `chipLabel` in `ModelTag`, and `modelChangeLabel`).
   * Those rules live with the screens that own them rather than here, so this
   * class keeps answering only questions about the row itself.
   *
   * It is written from `resolvedModel`, which is the only field that always
   * names the model actually running. The other three can be borrowed: when a
   * user remaps the slots onto another provider, the CLI keeps Anthropic's own
   * wording in `displayName`/`description` for some rows while `resolvedModel`
   * carries the real id. Measured on CLI 2.1.261 with the slots pointed at GLM,
   * the haiku row read "Haiku 4.5" while running `glm-4.5-air` — a model that
   * account cannot even reach.
   *
   * Rows the CLI did not resolve (our Fable fallback, an older CLI that omits
   * the field) fall back to `value`, which is the very thing we hand back to
   * select the row and so is never wrong about what will run.
   *
   * The `default` row is the one exception. It stands for a choice — "use
   * whatever the default is" — rather than for a model, so naming it after the
   * model behind it would misreport what the user actually picked. It keeps its
   * own name, and the model it currently resolves to is already spelled out in
   * its description.
   */
  get label(): string {
    if (this.isDefaultRow) return this.displayName;
    return toDisplayLabel(this.resolvedModel ?? this.value);
  }

  /**
   * The two lines a model picker row shows.
   *
   * The blurb is the CLI's `description` verbatim. We do not edit it, trim it,
   * or lift parts out of it: it is the CLI's sentence about this model, and the
   * moment we start rewriting it we are back to guessing at a shape.
   */
  get rowText(): ModelRowText {
    return { title: this.label, blurb: this.description || undefined };
  }

  /** A copy of this row carrying `resolvedModel`, leaving the original untouched. */
  withResolvedModel(id: string): ModelInfo {
    return new ModelInfo({ ...this.raw, resolvedModel: id });
  }

  /** The CLI's original entry, unchanged. */
  toJSON(): Readonly<Record<string, unknown>> {
    return this.raw;
  }
}
