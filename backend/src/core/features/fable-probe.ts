import { Claude } from '../claude';

/**
 * Fable availability probe.
 *
 * Fable 5 is a promotional model whose availability is decided per-account by
 * the server. The `initialize` catalog omits Fable for accounts that haven't
 * activated it, yet `--model fable` still works for them (verified) — so the
 * catalog alone can't tell us whether THIS account may select Fable once the
 * public promo window (`FABLE_PROMO_END`) has passed.
 *
 * The only reliable signal is a real call: there is no free/offline check
 * (`set_model` succeeds locally even for a nonexistent model, and `initialize`
 * only lists entitled accounts). So we run one genuine `--model fable` request
 * and treat a clean success as "this account can still use Fable".
 *
 * Cost/latency are minimized with `--effort low` +
 * `--exclude-dynamic-system-prompt-sections`, and `--no-session-persistence`
 * keeps the probe out of the user's session list. A real call still costs a few
 * cents (Fable is prepaid), so callers gate this behind the promo-window check
 * and cache the result (see `getFableAvailability`) rather than probing per
 * render — the intended trigger is "user opened the model picker after the
 * promo date, and the cache is stale".
 */
const PROBE_ARGS: readonly string[] = [
  '-p',
  'Say OK',
  '--model',
  'fable',
  '--effort',
  'low',
  '--exclude-dynamic-system-prompt-sections',
  '--no-session-persistence',
  '--output-format',
  'json',
  // This probe asks one question of the model and reads the exit shape; it never
  // calls a tool, so the workspace's MCP servers are pure cost to it. Without
  // this the probe starts every one of them, and a server configured as
  // `docker run` leaves its container behind (#363, measured: one per probe).
  // `--strict-mcp-config` restricts the session to the servers named by
  // `--mcp-config`, and none is passed, so it loads none at all.
  '--strict-mcp-config',
];

/** How long a probe result is trusted before we probe again. */
export const FABLE_PROBE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

interface FableProbeCacheEntry {
  available: boolean;
  /** The id the `fable` alias resolved to, so the picker can name the version. */
  canonicalModel: string | null;
  /** epoch ms when the probe ran. */
  checkedAt: number;
}

let cache: FableProbeCacheEntry | null = null;

/**
 * Run one real Fable call and report whether it succeeded for this account.
 *
 * Fail-closed: any non-success result, unparseable output, or thrown error
 * (entitlement rejection, timeout, missing CLI) yields `false`. We must never
 * advertise a model the account can't actually select — a false positive
 * surfaces Fable in the picker only for `set_model` to fail on use.
 */
export async function probeFableAvailability(
  workingDir?: string,
): Promise<{ available: boolean; canonicalModel: string | null }> {
  const DENIED = { available: false, canonicalModel: null };
  try {
    // 30s: the probe itself is ~6-10s; leave headroom for a cold CLI start.
    const { stdout } = await Claude.exec([...PROBE_ARGS], { timeout: 30_000, cwd: workingDir });
    // The result is the LAST json line — hooks/system lines may precede it.
    const lastLine = stdout
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .pop();
    if (!lastLine) return DENIED;
    const parsed = JSON.parse(lastLine) as {
      subtype?: string;
      is_error?: boolean;
      modelUsage?: Record<string, { canonicalModel?: string }>;
    };
    // `subtype` alone would lie here: an authentication failure still comes back
    // as subtype "success" with is_error true (measured against a proxy base URL
    // with a bad token). Both fields have to agree.
    if (parsed.subtype !== 'success' || parsed.is_error !== false) return DENIED;

    // The id the alias actually resolved to, so the picker can name the version
    // instead of us writing one down. `modelUsage` is empty on a refused call
    // and may be absent entirely, so nothing here assumes it has a key.
    const usage = parsed.modelUsage ?? {};
    const key = Object.keys(usage)[0];
    const canonicalModel = (key && (usage[key]?.canonicalModel ?? key)) || null;
    return { available: true, canonicalModel };
  } catch {
    return DENIED;
  }
}

/**
 * Cached Fable availability. Serves a fresh (< TTL) cached result without
 * re-probing; otherwise probes once and stores the outcome (positive OR
 * negative — a negative is cached too so ineligible accounts don't re-probe on
 * every picker open). Pass `force` to bypass a valid cache, or `now`/`ttlMs`
 * for deterministic testing.
 */
export async function getFableAvailability(opts?: {
  workingDir?: string;
  now?: number;
  ttlMs?: number;
  force?: boolean;
}): Promise<{ available: boolean; canonicalModel: string | null; checkedAt: number; fromCache: boolean }> {
  const now = opts?.now ?? Date.now();
  const ttlMs = opts?.ttlMs ?? FABLE_PROBE_TTL_MS;

  if (!opts?.force && cache && now - cache.checkedAt < ttlMs) {
    return {
      available: cache.available,
      canonicalModel: cache.canonicalModel,
      checkedAt: cache.checkedAt,
      fromCache: true,
    };
  }

  const { available, canonicalModel } = await probeFableAvailability(opts?.workingDir);
  cache = { available, canonicalModel, checkedAt: now };
  return { available, canonicalModel, checkedAt: now, fromCache: false };
}

/**
 * Drop the cached probe result. Call on account switch — availability is
 * per-account, so a cached verdict from a previous account must not leak.
 */
export function invalidateFableProbeCache(): void {
  cache = null;
}
