/**
 * `${VAR}` placeholder expansion for MCP server configs.
 *
 * A `.mcp.json` is meant to be committed and shared by a team, so its secrets and
 * machine-specific paths are written as placeholders that each machine fills in.
 * The `claude` CLI expands them before it spawns a server; anything that spawns a
 * server itself has to do the same, or the server receives the literal `${VAR}`
 * text as its configuration (#364).
 *
 * The grammar below mirrors what the CLI accepts, so a config that works in the
 * terminal works here too:
 *
 *   ${VAR}            → the value of VAR, when resolvable
 *   ${VAR:-fallback}  → VAR when resolvable, otherwise `fallback`
 *   pre-${VAR}-post   → expanded in place, the surrounding text is kept
 *   ${MISSING}        → left verbatim, and the name is reported as missing
 *
 * Leaving an unresolvable placeholder verbatim (rather than substituting an empty
 * string) is deliberate: an empty value looks like a configured-but-blank setting,
 * while the untouched `${VAR}` text keeps the misconfiguration visible. Callers get
 * the names back in `missingVars` so they can surface them instead of failing mutely.
 */

/**
 * Where a placeholder's value may come from. Modelled as a parameter rather than
 * read from `process.env` inside, so the resolution order is decided by the caller
 * (and is therefore testable without mutating the process environment).
 */
export type EnvSource = Record<string, string | undefined>;

/**
 * Matches `${NAME}` and `${NAME:-fallback}`.
 *
 * `NAME` follows the POSIX shell rule (leading letter/underscore, then alphanumerics
 * and underscores), which is also what the CLI accepts. The fallback is captured
 * separately and may hold anything up to the closing brace, `}` included, so
 * `${VAR:-}` is a valid way to spell "empty when unset".
 */
const PLACEHOLDER = /\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-([^}]*))?\}/g;

/** Outcome of expanding one string: the result plus any names that could not be resolved. */
export interface ExpansionResult {
  expanded: string;
  /** Names of placeholders with no value and no fallback, in first-seen order, deduplicated. */
  missingVars: string[];
}

/**
 * Expand every placeholder in `value` against `source`.
 *
 * A variable that is present but empty counts as resolved — an explicit empty value
 * is a choice the user made, not a missing one — so `${VAR:-fallback}` yields the
 * empty string rather than the fallback in that case, matching shell `:-` semantics
 * only for *unset* variables.
 */
export function expandPlaceholders(value: string, source: EnvSource): ExpansionResult {
  const missing: string[] = [];
  const expanded = value.replace(PLACEHOLDER, (match, name: string, fallback?: string) => {
    const resolved = source[name];
    if (resolved !== undefined) return resolved;
    if (fallback !== undefined) return fallback;
    if (!missing.includes(name)) missing.push(name);
    return match;
  });
  return { expanded, missingVars: missing };
}

/** True when `value` contains at least one placeholder. Cheap pre-check for callers. */
export function hasPlaceholder(value: string): boolean {
  // A fresh regex avoids the shared `lastIndex` that a /g literal carries between calls.
  return new RegExp(PLACEHOLDER.source).test(value);
}
