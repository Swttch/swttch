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
 * In-memory manager holding at most one active pairing code per launch.
 * Re-issuing rotates the code and resets the failure counter/lock.
 */
export class TunnelPairingStore {
  private readonly now: () => number;
  private readonly token: string;
  private readonly ttlMs: number;
  private readonly maxAttempts: number;
  private readonly lockoutMs: number;

  private activeCode: string | null = null;
  private codeExpiresAt = 0;
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
   * Generate and store a fresh single-use code, replacing any previous one.
   * Re-issuing clears the failed-attempt counter and any active lock: the
   * operator is present and deliberately rotating, so the new code must not be
   * punished for the old code's failed guesses.
   */
  issueCode(): string {
    const code = randomBytes(PAIRING_CODE_BYTES).toString('base64url');
    this.activeCode = code;
    this.codeExpiresAt = this.now() + this.ttlMs;
    this.failedAttempts = 0;
    this.lockedUntil = 0;
    return code;
  }

  /**
   * Seed a pre-generated single-use code as the active code, replacing any
   * previous one. Unlike issueCode() (which mints fresh randomness for the
   * tunnel QR), the code here is generated OUT-OF-BAND by the launcher (Kotlin
   * plugin / ccg CLI) and injected via env at startup: the launcher embeds the
   * same code as `?pair=` in the LOCAL webview URL so the local webview can
   * redeem it for the auth token on first load. Pairing is thus used for LOCAL
   * too, not just the tunnel.
   *
   * Integrates identically to issueCode(): it resets the failed-attempt counter
   * and clears any active lock, and the code remains strictly single-use —
   * redeem() consumes it on the first successful exchange. Defaults to a
   * generous local TTL (INITIAL_PAIR_CODE_TTL_MS) for a slow first load.
   *
   * The caller MUST NOT log the code value.
   */
  seedCode(code: string, ttlMs: number = INITIAL_PAIR_CODE_TTL_MS): void {
    this.activeCode = code;
    this.codeExpiresAt = this.now() + ttlMs;
    this.failedAttempts = 0;
    this.lockedUntil = 0;
  }

  /**
   * Exchange a code for the token. Constant-time compares against the active,
   * non-expired code. On success the code is CONSUMED (single-use). On failure
   * the attempt is counted toward the lockout threshold.
   */
  redeem(code: string): RedeemResult {
    const now = this.now();

    // Locked out — refuse everything (including the correct code) until cooldown.
    if (now < this.lockedUntil) {
      return { ok: false, reason: 'locked' };
    }

    // No live code (never issued, already consumed, or expired).
    if (this.activeCode === null || now >= this.codeExpiresAt) {
      const expired = this.activeCode !== null; // had a code, but it aged out
      const locked = this.registerFailure(now);
      return { ok: false, reason: locked ? 'locked' : expired ? 'expired' : 'invalid' };
    }

    // Constant-time comparison against the live code.
    if (!safeEqual(code, this.activeCode)) {
      const locked = this.registerFailure(now);
      return { ok: false, reason: locked ? 'locked' : 'invalid' };
    }

    // Success → single-use consumption + reset counters.
    this.activeCode = null;
    this.codeExpiresAt = 0;
    this.failedAttempts = 0;
    this.lockedUntil = 0;
    return { ok: true, token: this.token };
  }

  /** True when a live (issued, unexpired, unconsumed) code exists right now. */
  hasActiveCode(now = this.now()): boolean {
    return this.activeCode !== null && now < this.codeExpiresAt;
  }

  /** Record a failed attempt; returns true when this attempt engaged the lockout. */
  private registerFailure(now: number): boolean {
    this.failedAttempts += 1;
    if (this.failedAttempts >= this.maxAttempts) {
      // Threshold reached → engage the lockout and burn any active code so a
      // near-guessed code can't be used the instant the counter would reset.
      this.lockedUntil = now + this.lockoutMs;
      this.failedAttempts = 0;
      this.activeCode = null;
      this.codeExpiresAt = 0;
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
 * Mint a fresh single-use pairing code for opening the current backend in the
 * SYSTEM BROWSER (a separate storage partition from JCEF, so it cannot reuse
 * the JCEF localStorage token — it must redeem its own code at POST /pair).
 *
 * Shared by the WS handler (ISSUE_LOCAL_PAIRING, webview-initiated) and the
 * HTTP route (GET /internal/local-pair, Kotlin status-card-initiated) so both
 * paths mint codes identically. Callers MUST NOT log the returned value —
 * this is the single place the "never log the code" contract is documented.
 */
export function issueLocalPairCode(): string {
  return tunnelPairing.issueCode();
}
