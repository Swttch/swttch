// webview/src/api/bridge/authToken.ts
//
// Central acquisition of the per-launch control-channel auth token.
//
// The Node backend requires this token on every /ws, /rpc, /logs upgrade,
// carried in the Sec-WebSocket-Protocol header as `['ccg-auth', <token>]`
// (RFC 6455 — the only header a browser WebSocket can attach at handshake).
// This module is the SINGLE place the webview resolves that token, so every
// backend connection attaches the same value.
//
// The token is NEVER placed in a URL. EVERY browser client — the local webview
// AND a remote phone — obtains the token by redeeming a single-use PAIRING CODE
// at POST /pair. The trusted bootstrap embeds an initial pairing code as
// `?pair=<code>` in the page URL (the JetBrains JCEF load URL / the ccg
// standalone browser URL for local, the QR a remote device scans for remote).
// `?pair=` is therefore the SOLE production delivery path for the token; the
// legacy `?token=` URL param is gone (URLs leak via logs/history/Referer).
//
// Resolution priority (see design doc ignore/plans/control-channel-auth.md):
//   1. localStorage (shared across same-origin panels) — a token that ACTUALLY
//      authenticated is stored here (persistValidatedToken, called on WebSocket
//      `open`). localStorage is chosen over sessionStorage DELIBERATELY: JCEF
//      opens each editor tab as its own browser context with ISOLATED
//      sessionStorage, so a per-tab store forces every new tab to re-pair — but
//      the initial `?pair=` code is single-use and already consumed by the first
//      tab, so a second tab re-redeeming it gets 401 → the "403 Forbidden" block.
//      localStorage is SHARED across the panels of one origin, so a host that
//      authenticated once is reused by every tab (auth is scoped to the HOST, not
//      the tab), and a full page RELOAD also survives (the consumed `?pair=` code
//      cannot be re-redeemed). Trade-off: the token now persists on disk until
//      superseded — acceptable because it is per-launch, so a backend restart
//      invalidates it. We store only AFTER a successful connect
//      (validate-then-store) so a wrong/stale token never sticks and poisons a
//      tab into an endless 401 reconnect loop. An attacker never had a valid
//      token to store here, so this does not weaken the gate.
//   2. Dev fallback (Vite dev only, import.meta.env.DEV): the VITE_CCG_DEV_TOKEN
//      env, else a hard-coded shared DEV-ONLY default that matches the backend's
//      DEV_INSECURE_AUTH_TOKEN so `bb`/`ww` work with zero manual env.
//   3. Otherwise '' synchronously — the production path. The `?pair=<code>`
//      exchange in ensureAuthTokenReady() then redeems the pairing code at POST
//      /pair and, on success, caches the returned token in-memory. Token
//      acquisition is ASYNC here — callers MUST `await ensureAuthTokenReady()`
//      before opening a WebSocket. If no code and no token, the backend rejects
//      the connection (401), the correct secure-by-default outcome.
//
// The token is NEVER injected into statically served HTML — an attacker reaching
// the port could otherwise GET / and read it.

/**
 * The subprotocol marker paired with the token. Mirrors the backend's
 * AUTH_SUBPROTOCOL in backend/src/ws/ws-server.ts.
 */
export const AUTH_SUBPROTOCOL = 'ccg-auth';

/**
 * Dev-only, INSECURE-by-design shared default. Mirrors the backend's
 * DEV_INSECURE_AUTH_TOKEN (backend/src/config/environment.ts). Applies ONLY in
 * Vite dev (import.meta.env.DEV) so local backend+webview dev servers pair up
 * without any manual env. Never used in a production build.
 */
const DEV_INSECURE_AUTH_TOKEN = 'ccg-dev-insecure-token';

// localStorage key under which the validated token is persisted so it is shared
// across same-origin JCEF panels and survives a reload (after the single-use
// `?pair=` code has been stripped/consumed).
const TOKEN_STORAGE_KEY = 'ccg-auth-token';

// In-memory module singleton. Resolved once, then reused for every connection.
let cachedToken: string | null = null;

/** Read the persisted token from localStorage, tolerating storage being unavailable. */
function readStoredToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_STORAGE_KEY) || null;
  } catch {
    return null;
  }
}

/** Persist the token to localStorage (shared across same-origin panels) so a reload
 * and any newly-opened panel reuse it. Best-effort. */
function storeToken(token: string): void {
  if (!token) return;
  try {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
  } catch {
    // localStorage can be unavailable (private mode, exotic embeddings); the
    // in-memory cache still serves this page load, only reload-persistence is lost.
  }
}

/**
 * How long a panel that lost the race to redeem the single-use `?pair=` code
 * waits for the winning panel to publish the token it obtained.
 *
 * Sized for "the other panel is mid-handshake", not for a human: the winner only
 * has to finish its POST /pair and open one WebSocket. If nothing lands by then,
 * the code really was expired/invalid and the normal failure path takes over.
 */
const PEER_TOKEN_WAIT_MS = 10_000;

/**
 * Wait for another same-origin panel to publish a validated token, resolving to
 * it (or '' on timeout).
 *
 * This exists because the `?pair=` code is single-use while JCEF opens each
 * editor tab as its OWN browser context. When the IDE restores a split, both
 * panes load at the same instant with the same code, each in a separate JS world
 * (so the in-flight memoization in redeemPairCode cannot help them). One wins the
 * redeem; the other gets 401 — and used to fall straight to the "403 Forbidden"
 * block even though it was perfectly entitled to connect (#302 exposed this once
 * splits started restoring again).
 *
 * The loser does NOT retry the code — a consumed code must stay consumed, and a
 * retry would burn a failed-attempt slot toward the backend's lockout. It simply
 * waits for the winner, which calls persistValidatedToken() AFTER its socket has
 * actually authenticated. So the token handed over here is one the backend has
 * already accepted; no part of the security model is relaxed.
 *
 * `storage` fires in every other same-origin context on write, so the handover is
 * event-driven. A short poll runs alongside it purely as a safety net for
 * embeddings that fire the event unreliably.
 */
function waitForPeerToken(timeoutMs = PEER_TOKEN_WAIT_MS): Promise<string> {
  return new Promise((resolve) => {
    const existing = readStoredToken();
    if (existing) {
      resolve(existing);
      return;
    }

    let settled = false;
    const finish = (token: string) => {
      if (settled) return;
      settled = true;
      window.clearInterval(poll);
      window.clearTimeout(timer);
      try {
        window.removeEventListener('storage', onStorage);
      } catch {
        // removal is best-effort; `settled` already makes this idempotent
      }
      resolve(token);
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key !== null && event.key !== TOKEN_STORAGE_KEY) return;
      const token = readStoredToken();
      if (token) finish(token);
    };

    const poll = window.setInterval(() => {
      const token = readStoredToken();
      if (token) finish(token);
    }, 250);

    const timer = window.setTimeout(() => finish(''), timeoutMs);

    try {
      window.addEventListener('storage', onStorage);
    } catch {
      // no storage events in this embedding — the poll above still covers us
    }
  });
}

// ── Remote-Control tunnel pairing state ─────────────────────────────────────
// The `?pair=` code captured from the URL (null when absent). A single-use
// short-lived credential the remote device exchanges for the real token.
let pairCode: string | null = null;
// Memoized in-flight/settled redemption so reconnects never re-POST the code.
let pairPromise: Promise<string> | null = null;

/** Remote-device pairing lifecycle, surfaced to the UI so an expired/locked code
 * shows a clear "rescan the QR" state instead of a silent 401 loop. */
export type PairingState = 'idle' | 'pairing' | 'paired' | 'failed';
/** Why pairing failed — drives the message shown to the remote user. */
export type PairingFailureReason = 'expired' | 'locked' | 'network' | null;

let pairingState: PairingState = 'idle';
let pairingFailureReason: PairingFailureReason = null;
const pairingListeners = new Set<() => void>();

function setPairingState(state: PairingState, reason: PairingFailureReason = null): void {
  pairingState = state;
  pairingFailureReason = reason;
  pairingListeners.forEach((cb) => {
    try {
      cb();
    } catch {
      // a listener throwing must not break pairing
    }
  });
}

/**
 * Read a query param from the current page URL, and if present strip it from the
 * visible URL (history.replaceState) while preserving every other query param,
 * the path, and the hash. Returns the raw value, or null when absent.
 */
function readAndStripParam(name: string): string | null {
  if (typeof window === 'undefined' || !window.location) return null;
  const params = new URLSearchParams(window.location.search);
  const value = params.get(name);
  if (!value) return null;

  params.delete(name);
  const rest = params.toString();
  const newUrl = window.location.pathname + (rest ? `?${rest}` : '') + window.location.hash;
  try {
    window.history.replaceState(window.history.state, '', newUrl);
  } catch {
    // replaceState can throw in exotic embeddings; keeping the value is what
    // matters, the address-bar cleanup is best-effort.
  }
  return value;
}

/**
 * True when [hostname] is a loopback host (localhost / 127.0.0.1 / ::1). Pure so
 * it is directly unit-testable without mocking window.location. Used to gate the
 * insecure dev fallback so it is NEVER applied over a tunnel or any remote host.
 */
export function isLoopbackHostname(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname === '[::1]'
  );
}

/** Whether the current page is served from a loopback host. */
function isLoopbackHost(): boolean {
  if (typeof window === 'undefined' || !window.location) return false;
  return isLoopbackHostname(window.location.hostname);
}

function resolveToken(): string {
  // 1. localStorage — a token that SUCCESSFULLY connected on a previous load
  //    (persisted by persistValidatedToken on WS open). Shared across same-origin
  //    JCEF panels, so a newly-opened tab AND a full page reload reconnect without
  //    re-redeeming a pairing code (the `?pair=` code is single-use and already
  //    consumed/stripped by the first panel).
  const fromSession = readStoredToken();
  if (fromSession) return fromSession;

  // 2. Dev fallback — Vite dev only, AND only when the page is served from a
  //    LOOPBACK host. The shared insecure dev token must NEVER be used over a
  //    tunnel: a dev server exposed via cloudflared (`*.trycloudflare.com`) would
  //    otherwise let anyone with the URL connect with a well-known token = public
  //    RCE. Over a remote host we fall through to the pairing path so even a dev
  //    build must redeem a `?pair=` code — matching production behavior.
  if (import.meta.env.DEV && isLoopbackHost()) {
    const envToken = import.meta.env.VITE_CCG_DEV_TOKEN as string | undefined;
    return envToken && envToken.length > 0 ? envToken : DEV_INSECURE_AUTH_TOKEN;
  }

  // 3. Production with no stored token: return empty synchronously. The `?pair=`
  //    exchange in ensureAuthTokenReady() supplies the token (the launcher put a
  //    pairing code in the URL); if none, the backend rejects the connection
  //    (401) — the correct secure-by-default outcome. `?token=` is intentionally
  //    NOT read — the token is never carried in a URL.
  return '';
}

/**
 * The per-launch auth token, resolved once and cached in-memory. Safe to call
 * repeatedly; the URL is only read/stripped on the first call. Returns '' when
 * no synchronous token is available (a `?pair=` exchange may still supply one —
 * use ensureAuthTokenReady()).
 */
export function getAuthToken(): string {
  if (cachedToken === null) {
    cachedToken = resolveToken();
  }
  return cachedToken;
}

/**
 * Capture the `?pair=` code from the URL (and strip it) if present. Idempotent.
 */
function capturePairCode(): void {
  if (pairCode === null) {
    pairCode = readAndStripParam('pair');
  }
}

/**
 * Redeem the captured pairing code at POST /pair, exchanging it for the real
 * token. Memoized so concurrent connects / reconnects share one round-trip and
 * a failed/consumed code is never re-POSTed. On success the token is cached so
 * getAuthToken()/authSubprotocols() return it thereafter.
 */
function redeemPairCode(code: string): Promise<string> {
  if (pairPromise) return pairPromise;
  setPairingState('pairing');
  pairPromise = (async () => {
    try {
      const res = await fetch('/pair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      if (!res.ok) {
        // Losing the race for a single-use code is indistinguishable from an
        // expired one: both come back 401. So on 401 only, give a sibling panel —
        // the other pane of a restored split, loading in its own JCEF context with
        // the same code — a moment to publish the token it just validated (#302).
        //
        // 429 is NOT retried this way: a lockout is a definitive answer about the
        // whole backend, not a lost race, and waiting would only stall the user
        // before showing them why they are locked out.
        if (res.status !== 429) {
          const peerToken = await waitForPeerToken();
          if (peerToken) {
            cachedToken = peerToken;
            setPairingState('paired');
            return peerToken;
          }
        }
        // 429 → rate-limited/locked; anything else (401) → expired/invalid.
        setPairingState('failed', res.status === 429 ? 'locked' : 'expired');
        return '';
      }
      const data = (await res.json()) as { token?: unknown };
      const token = typeof data.token === 'string' ? data.token : '';
      if (!token) {
        setPairingState('failed', 'expired');
        return '';
      }
      cachedToken = token;
      setPairingState('paired');
      return token;
    } catch {
      setPairingState('failed', 'network');
      return '';
    }
  })();
  return pairPromise;
}

/**
 * Resolve the auth token, performing the async `/pair` exchange when the token
 * is only obtainable via a remote pairing code. Callers (the WebSocket
 * connector) MUST await this before opening a connection so no socket is ever
 * opened token-less. Returns '' when no token can be resolved.
 */
export async function ensureAuthTokenReady(): Promise<string> {
  // A synchronously-known token (a validated localStorage token, or the dev
  // fallback) always wins — no pairing round-trip needed.
  const sync = getAuthToken();
  if (sync) return sync;

  // Otherwise attempt the remote pairing exchange if a code was captured.
  capturePairCode();
  if (pairCode) return redeemPairCode(pairCode);

  // No token, no pairing code — leave it to the backend to reject (401).
  return '';
}

/**
 * True when access is DEFINITIVELY forbidden: the page is on a REMOTE host (a
 * tunnel — not loopback) with no way to authenticate (no validated token and no
 * `?pair=` code to redeem). This is an unpaired remote device and must be shown a
 * hard "403 / pair required" block instead of a blank reconnect loop.
 *
 * Deliberately NARROW so a legitimate client is never bounced to a block screen:
 * - a LOCAL (loopback) client with no token = a transient backend outage → keep
 *   reconnecting, never forbidden;
 * - a remote client WITH a `?pair=` code = pairing in flight (or, if it failed,
 *   handled by the pairing-failed notice) → not "forbidden" here;
 * - a remote client with a previously-validated token (localStorage) → connects.
 */
export function isRemoteBlocked(): boolean {
  return !isLoopbackHost() && !getAuthToken() && !hasPairCode();
}

/**
 * Explicitly resolve the token and capture (and strip) the `?pair=` code at app
 * startup, before React Router or any other code can mutate the URL. The actual
 * pairing round-trip happens lazily in ensureAuthTokenReady(). Idempotent.
 */
export function initAuthToken(): void {
  getAuthToken();
  capturePairCode();
}

/**
 * Persist the currently-resolved token to localStorage. Call this ONLY after a
 * connection has actually authenticated (WebSocket `open`), so a wrong/stale
 * token is never stored — that would poison the tab into an endless 401 reconnect
 * loop across reloads. A validated token, by contrast, must survive a reload so
 * the legitimate user isn't locked out after refreshing (the URL was stripped).
 */
export function persistValidatedToken(): void {
  if (cachedToken) storeToken(cachedToken);
}

/**
 * The subprotocol array for a backend WebSocket. `['ccg-auth', <token>]` when a
 * token is known, or just `['ccg-auth']` when it is not — an EMPTY subprotocol
 * string is invalid and makes `new WebSocket()` throw, so the token element is
 * omitted rather than passed as ''. The backend rejects a tokenless `ccg-auth`
 * with 401 (never a crash). Connectors await ensureAuthTokenReady() first so a
 * paired token is normally already in place.
 */
export function authSubprotocols(): string[] {
  const token = getAuthToken();
  return token ? [AUTH_SUBPROTOCOL, token] : [AUTH_SUBPROTOCOL];
}

/** True when a `?pair=` code was captured (this is a remote pairing session). */
export function hasPairCode(): boolean {
  capturePairCode();
  return pairCode !== null;
}

/** Current remote-pairing lifecycle state + failure reason (for the UI). */
export function getPairingStatus(): { state: PairingState; reason: PairingFailureReason } {
  return { state: pairingState, reason: pairingFailureReason };
}

/** Subscribe to pairing-state changes. Returns an unsubscribe function. */
export function subscribePairingStatus(cb: () => void): () => void {
  pairingListeners.add(cb);
  return () => {
    pairingListeners.delete(cb);
  };
}

/** @internal test-only: reset all cached state for isolation between cases. */
export function _resetAuthTokenCache(): void {
  cachedToken = null;
  pairCode = null;
  pairPromise = null;
  pairingState = 'idle';
  pairingFailureReason = null;
  try {
    window.localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    // ignore — storage may be unavailable in the test/host environment
  }
}
