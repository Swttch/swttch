import { randomBytes, timingSafeEqual } from 'crypto';
import { authToken } from '../../config/environment';

// ── Remote-Control tunnel: short-lived one-time pairing ─────────────────────
//
// The Remote-Control feature publishes the backend to the public internet via a
// cloudflared trycloudflare URL + QR. We must NOT bake the per-launch auth token
// into that URL — a leaked URL would then equal full compromise. Instead the
// QR/URL carries only a short-lived, single-use, high-entropy PAIRING CODE
// (WhatsApp-Web "link a device" model). The remote device exchanges the code
// (over the HTTPS tunnel, POST /pair) for the real token exactly once, within a
// short window. A later URL leak is useless: the code has expired or been
// consumed.
//
// Security posture (the code — never URL secrecy — is the protection):
//   - high entropy: PAIRING_CODE_BYTES bytes of crypto randomness (base64url),
//   - short TTL: the code dies after PAIRING_CODE_TTL_MS,
//   - single use: a successful redeem immediately invalidates the code,
//   - rate-limit + lockout: PAIRING_MAX_ATTEMPTS wrong guesses lock further
//     attempts (including the correct code) for PAIRING_LOCKOUT_MS.
//
// This module NEVER logs the pairing code or the token.

/** How long an issued pairing code stays valid. Kept short but with enough
 * headroom for a human to open the modal and scan the QR with a phone. */
export const PAIRING_CODE_TTL_MS = 120_000; // 2 minutes

/** TTL for the launcher-seeded INITIAL LOCAL pairing code (see seedCode). The
 * local webview redeems this on first load to obtain the auth token, so it needs
 * enough headroom for a slow cold start. A longer TTL is acceptable here because
 * the code is still strictly single-use — one successful redeem consumes it. */
export const INITIAL_PAIR_CODE_TTL_MS = 600_000; // 10 minutes

/** Failed redeem attempts (within the active window) before we lock out. */
export const PAIRING_MAX_ATTEMPTS = 5;

/** Cooldown after a lockout before redeems are accepted again. During the
 * lockout even the correct code is refused. The operator can re-issue a fresh
 * code (which also clears the lock) once they are back in control. */
export const PAIRING_LOCKOUT_MS = 60_000; // 1 minute

/** Entropy of each pairing code. 24 bytes = 192 bits, ~32 base64url chars —
 * infeasible to brute force within the TTL even without the lockout. */
export const PAIRING_CODE_BYTES = 24;

/**
 * How many LOCAL codes may be live at once.
 *
 * More than one has to be, because the launcher hands a code to each webview it
 * loads and those loads overlap: a restored editor split opens two panels in the
 * same instant, and a store holding a single code would have the second panel's
 * code silently revoke the first panel's before it could redeem it. Each code is
 * still strictly single-use with its own expiry; holding several of them costs a
 * brute-force attacker nothing worth counting against 192 bits apiece.
 *
 * Bounded so a long-running backend that has loaded panels all day does not
 * accumulate codes without limit. Eviction is oldest-first and only ever reaches
 * a code nobody redeemed.
 */
export const MAX_LIVE_LOCAL_CODES = 8;

/**
 * What a live code was minted for.
 *
 * The two are kept apart because re-issuing means different things for each. The
 * operator re-issuing the tunnel QR is saying "the old QR is not to be trusted",
 * so that MUST revoke the previous tunnel code. A panel loading is saying
 * nothing about any other panel, so it must revoke nothing.
 */
type PairingPurpose = 'tunnel' | 'local';

interface PairingEntry {
  code: string;
  expiresAt: number;
  purpose: PairingPurpose;
}

export type RedeemFailureReason = 'invalid' | 'expired' | 'locked';

export type RedeemResult =
  | { ok: true; token: string }
  | { ok: false; reason: RedeemFailureReason };

interface PairingOptions {
  /** Injectable clock (ms epoch). Defaults to Date.now — overridden in tests. */
  now?: () => number;
  /** The token handed out on a successful redeem. Defaults to the per-launch authToken. */
  token?: string;
  ttlMs?: number;
  maxAttempts?: number;
  lockoutMs?: number;
}

/**
 * In-memory manager of the pairing codes a launch is currently willing to
 * exchange for the token. Each code is single-use and carries its own expiry;
 * re-issuing the TUNNEL code rotates it (revoking the previous one) and resets
 * the failure counter/lock.
 */
export class TunnelPairingStore {
  private readonly now: () => number;
  private readonly token: string;
  private readonly ttlMs: number;
  private readonly maxAttempts: number;
  private readonly lockoutMs: number;

  /** Live codes, oldest first. Never contains a consumed code. */
  private entries: PairingEntry[] = [];
  private failedAttempts = 0;
  private lockedUntil = 0;

  constructor(opts: PairingOptions = {}) {
    this.now = opts.now ?? Date.now;
    this.token = opts.token ?? authToken;
    this.ttlMs = opts.ttlMs ?? PAIRING_CODE_TTL_MS;
    this.maxAttempts = opts.maxAttempts ?? PAIRING_MAX_ATTEMPTS;
    this.lockoutMs = opts.lockoutMs ?? PAIRING_LOCKOUT_MS;
  }

  /**
   * Generate and store a fresh single-use TUNNEL code, replacing any previous
   * tunnel code. Re-issuing clears the failed-attempt counter and any active
   * lock: the operator is present and deliberately rotating, so the new code
   * must not be punished for the old code's failed guesses.
   *
   * Local codes are left alone. Rotating the QR says the old QR is not to be
   * trusted; it says nothing about the panels the operator has open, and taking
   * their codes away would lock out a panel that is loading at that moment.
   */
  issueCode(): string {
    const code = randomBytes(PAIRING_CODE_BYTES).toString('base64url');
    const now = this.now();
    this.prune(now);
    this.entries = this.entries.filter((entry) => entry.purpose !== 'tunnel');
    this.entries.push({ code, expiresAt: now + this.ttlMs, purpose: 'tunnel' });
    this.failedAttempts = 0;
    this.lockedUntil = 0;
    return code;
  }

  /**
   * Generate and store a fresh single-use LOCAL code, alongside any others.
   *
   * This is the code a trusted local launcher hands to one webview load: the
   * JCEF panel URL, the system-browser handoff from the status card. Each load
   * gets its own, so a panel that reloads — because its host reconnected, its
   * cache was cleared, or the IDE re-created the tab — can pair again instead of
   * being stranded until the backend restarts (issue #479). Before this, one
   * code was minted per backend START, and once it was consumed any later load
   * that could not find an already-validated token had no way back in.
   */
  issueLocalCode(ttlMs: number = INITIAL_PAIR_CODE_TTL_MS): string {
    const code = randomBytes(PAIRING_CODE_BYTES).toString('base64url');
    this.addLocalCode(code, ttlMs);
    return code;
  }

  /**
   * Seed a pre-generated single-use LOCAL code, alongside any others. Unlike
   * issueCode() (which mints fresh randomness for the tunnel QR), the code here
   * is generated OUT-OF-BAND by the launcher (Kotlin plugin / ccg CLI) and
   * injected via env at startup: the launcher embeds the same code as `?pair=`
   * in the LOCAL webview URL so the local webview can redeem it for the auth
   * token on first load. Pairing is thus used for LOCAL too, not just the tunnel.
   *
   * Integrates identically to issueLocalCode(): it resets the failed-attempt
   * counter, clears any active lock, and the code remains strictly single-use —
   * redeem() consumes it on the first successful exchange. Defaults to a
   * generous local TTL (INITIAL_PAIR_CODE_TTL_MS) for a slow first load.
   *
   * The caller MUST NOT log the code value.
   */
  seedCode(code: string, ttlMs: number = INITIAL_PAIR_CODE_TTL_MS): void {
    this.addLocalCode(code, ttlMs);
  }

  /** Store a local code, keeping the pool pruned and bounded. */
  private addLocalCode(code: string, ttlMs: number): void {
    const now = this.now();
    this.prune(now);
    this.entries.push({ code, expiresAt: now + ttlMs, purpose: 'local' });
    const locals = this.entries.filter((entry) => entry.purpose === 'local');
    if (locals.length > MAX_LIVE_LOCAL_CODES) {
      const evicted = new Set(locals.slice(0, locals.length - MAX_LIVE_LOCAL_CODES));
      this.entries = this.entries.filter((entry) => !evicted.has(entry));
    }
    this.failedAttempts = 0;
    this.lockedUntil = 0;
  }

  /** Drop every code that has aged out. */
  private prune(now: number): void {
    this.entries = this.entries.filter((entry) => now < entry.expiresAt);
  }

  /**
   * Exchange a code for the token. Constant-time compares against every live
   * code. On success that one code is CONSUMED (single-use) and the others are
   * left untouched. On failure the attempt is counted toward the lockout
   * threshold.
   */
  redeem(code: string): RedeemResult {
    const now = this.now();

    // Locked out — refuse everything (including the correct code) until cooldown.
    if (now < this.lockedUntil) {
      return { ok: false, reason: 'locked' };
    }

    // Constant-time comparison against every code we hold. The scan tells an
    // attacker how many codes are live, which is not a secret; the comparison
    // itself never tells them how close a guess was.
    const match = this.entries.find((entry) => safeEqual(code, entry.code));
    if (match && now < match.expiresAt) {
      // Success → single-use consumption + reset counters.
      this.entries = this.entries.filter((entry) => entry !== match);
      this.failedAttempts = 0;
      this.lockedUntil = 0;
      return { ok: true, token: this.token };
    }

    // Aged out, rather than never known: either this exact code is one we held
    // until its TTL ran out, or every code we hold has. Both are worth telling
    // apart from a wrong guess, because they are what a user sees after leaving
    // a QR or a panel URL sitting too long.
    const expired = Boolean(match) || (this.entries.length > 0 && !this.hasActiveCode(now));
    this.prune(now);
    const locked = this.registerFailure(now);
    return { ok: false, reason: locked ? 'locked' : expired ? 'expired' : 'invalid' };
  }

  /** True when at least one live (issued, unexpired, unconsumed) code exists. */
  hasActiveCode(now = this.now()): boolean {
    return this.entries.some((entry) => now < entry.expiresAt);
  }

  /** How many live codes are held right now. Test/diagnostic accessor. */
  liveCodeCount(now = this.now()): number {
    return this.entries.filter((entry) => now < entry.expiresAt).length;
  }

  /** Record a failed attempt; returns true when this attempt engaged the lockout. */
  private registerFailure(now: number): boolean {
    this.failedAttempts += 1;
    if (this.failedAttempts >= this.maxAttempts) {
      // Threshold reached → engage the lockout and burn every active code so a
      // near-guessed code can't be used the instant the counter would reset.
      this.lockedUntil = now + this.lockoutMs;
      this.failedAttempts = 0;
      this.entries = [];
      return true;
    }
    return false;
  }
}

/**
 * Constant-time string compare that never throws on length mismatch. The early
 * length check is not itself constant-time, but the code length is not secret.
 */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * Build the URL encoded into the tunnel QR: the tunnel base + `?pair=<code>`.
 * Deliberately carries ONLY the pairing code — never the auth token.
 */
export function buildPairingUrl(baseUrl: string, code: string): string {
  const trimmed = baseUrl.replace(/\/+$/, '');
  return `${trimmed}/?pair=${encodeURIComponent(code)}`;
}

/** Process-wide singleton bound to the real per-launch token + wall clock. */
export const tunnelPairing = new TunnelPairingStore();

/**
 * Mint a fresh single-use pairing code for a LOCAL client of this backend: the
 * system browser opened from the status card (a separate storage partition from
 * JCEF, so it cannot reuse the JCEF localStorage token), and every JCEF panel
 * load, which asks for its own code so a reloaded panel can pair again.
 *
 * Shared by the WS handler (ISSUE_LOCAL_PAIRING, webview-initiated) and the
 * HTTP route (GET /internal/local-pair, Kotlin-initiated) so every path mints
 * codes identically. Callers MUST NOT log the returned value — this is the
 * single place the "never log the code" contract is documented.
 *
 * Local, not tunnel: minting here must not revoke the code another panel is
 * about to redeem, and must not revoke the operator's QR either.
 */
export function issueLocalPairCode(): string {
  return tunnelPairing.issueLocalCode();
}
