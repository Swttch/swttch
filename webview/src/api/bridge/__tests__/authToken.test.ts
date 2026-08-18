import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AUTH_SUBPROTOCOL,
  authSubprotocols,
  getAuthToken,
  initAuthToken,
  ensureAuthTokenReady,
  hasPairCode,
  getPairingStatus,
  persistValidatedToken,
  isLoopbackHostname,
  isRemoteBlocked,
  _resetAuthTokenCache,
} from '../authToken';

// The dev-only shared default mirrored from backend DEV_INSECURE_AUTH_TOKEN.
const DEV_INSECURE_AUTH_TOKEN = 'ccg-dev-insecure-token';

function setUrl(url: string): void {
  window.history.replaceState({}, '', url);
}

describe('authToken', () => {
  beforeEach(() => {
    _resetAuthTokenCache();
    setUrl('/');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    _resetAuthTokenCache();
    setUrl('/');
  });

  it('attaches the resolved token as the ["ccg-auth", token] subprotocol array', () => {
    window.localStorage.setItem('ccg-auth-token', 'secret123');
    expect(authSubprotocols()).toEqual([AUTH_SUBPROTOCOL, 'secret123']);
    expect(AUTH_SUBPROTOCOL).toBe('ccg-auth');
  });

  it('caches the token so it is only resolved once', () => {
    window.localStorage.setItem('ccg-auth-token', 'first');
    expect(getAuthToken()).toBe('first');
    // Even if storage changes later, the cached value is reused.
    window.localStorage.setItem('ccg-auth-token', 'second');
    expect(getAuthToken()).toBe('first');
  });

  // ── The `?token=` URL param is gone: the token is NEVER carried in a URL.
  //    Every client now redeems a single-use `?pair=` code at POST /pair. A
  //    stray `?token=` must be IGNORED entirely (not read, not stored). ────────
  it('IGNORES a ?token= URL param (the token is never carried in a URL)', () => {
    vi.stubEnv('DEV', false);
    _resetAuthTokenCache();
    setUrl('/?token=ignored');
    // Production build, no localStorage token: the param is not read.
    expect(getAuthToken()).toBe('');
    expect(authSubprotocols()).toEqual([AUTH_SUBPROTOCOL]);
    // Nothing was persisted from the URL either.
    expect(window.localStorage.getItem('ccg-auth-token')).toBeNull();
  });

  describe('dev fallback (import.meta.env.DEV)', () => {
    it('falls back to the shared dev default when no stored token and no env', () => {
      // Vitest runs with import.meta.env.DEV = true by default.
      expect(import.meta.env.DEV).toBe(true);
      expect(getAuthToken()).toBe(DEV_INSECURE_AUTH_TOKEN);
    });

    it('prefers VITE_CCG_DEV_TOKEN over the shared default in dev', () => {
      vi.stubEnv('VITE_CCG_DEV_TOKEN', 'my-dev-token');
      _resetAuthTokenCache();
      expect(getAuthToken()).toBe('my-dev-token');
    });

    it('returns empty (no insecure default) in a production build with no stored token', () => {
      vi.stubEnv('DEV', false);
      _resetAuthTokenCache();
      expect(getAuthToken()).toBe('');
      expect(authSubprotocols()).toEqual([AUTH_SUBPROTOCOL]);
    });

    // The dev fallback is gated on a LOOPBACK host so it is NEVER handed out over
    // a tunnel (a dev server exposed via cloudflared would otherwise let anyone
    // with the URL connect with a well-known token = public RCE). The loopback
    // predicate is pure and tested directly here.
    it('treats localhost / 127.0.0.1 / ::1 as loopback (dev fallback allowed)', () => {
      expect(isLoopbackHostname('localhost')).toBe(true);
      expect(isLoopbackHostname('127.0.0.1')).toBe(true);
      expect(isLoopbackHostname('::1')).toBe(true);
      expect(isLoopbackHostname('[::1]')).toBe(true);
    });

    it('treats a tunnel / LAN host as non-loopback (no dev fallback over remote)', () => {
      expect(isLoopbackHostname('x.trycloudflare.com')).toBe(false);
      expect(isLoopbackHostname('192.168.0.10')).toBe(false);
      expect(isLoopbackHostname('example.com')).toBe(false);
      expect(isLoopbackHostname('')).toBe(false);
    });

    it('isRemoteBlocked is false on a loopback host (local is never hard-blocked)', () => {
      // jsdom serves from localhost → loopback → a local client with no token is a
      // transient outage, never "forbidden". The remote branch is covered by the
      // isLoopbackHostname tests above + the isRemoteBlocked composition.
      vi.stubEnv('DEV', false);
      _resetAuthTokenCache();
      setUrl('/'); // no ?pair=
      expect(isRemoteBlocked()).toBe(false);
    });
  });

  // ── Reload persistence (validate-then-store): the `?pair=` code is single-use
  //    and stripped from the URL, so a full page reload must recover a VALIDATED
  //    token from localStorage or the legit user is locked out (backend 401)
  //    in production. Only a token that actually connected is stored, so a wrong
  //    token never sticks and poisons the tab into an endless 401 loop. ────────
  describe('reload persistence (localStorage, validate-then-store)', () => {
    it('does NOT persist a resolved token until a connection succeeds', () => {
      // In dev getAuthToken resolves the dev token, but nothing is stored until
      // persistValidatedToken() is called on a successful WS open.
      expect(getAuthToken()).toBe(DEV_INSECURE_AUTH_TOKEN);
      expect(window.localStorage.getItem('ccg-auth-token')).toBeNull();
    });

    it('persistValidatedToken() stores the resolved token (called on WS open)', () => {
      expect(getAuthToken()).toBe(DEV_INSECURE_AUTH_TOKEN);
      persistValidatedToken();
      expect(window.localStorage.getItem('ccg-auth-token')).toBe(DEV_INSECURE_AUTH_TOKEN);
    });

    it('recovers a validated token from localStorage after a reload (prod, no dev fallback)', () => {
      // State right after a reload: production build (no dev fallback), the
      // single-use pairing code already consumed, but a previously-validated
      // token survived in localStorage.
      vi.stubEnv('DEV', false);
      window.localStorage.setItem('ccg-auth-token', 'survived');
      setUrl('/panel');
      expect(getAuthToken()).toBe('survived');
    });

    it('a validated localStorage token takes precedence over the dev fallback', () => {
      // localStorage is precedence (1); the dev fallback is (2).
      window.localStorage.setItem('ccg-auth-token', 'stored');
      expect(getAuthToken()).toBe('stored');
    });
  });

  // ── Remote-Control tunnel pairing (?pair=<code> → POST /pair → token). This is
  //    now the SOLE production delivery for BOTH local and remote clients. ──────
  describe('remote pairing (?pair=)', () => {
    function mockFetchOnce(impl: () => Promise<Response> | Response): ReturnType<typeof vi.fn> {
      const fn = vi.fn(impl);
      vi.stubGlobal('fetch', fn);
      return fn;
    }

    function jsonResponse(status: number, body: unknown): Response {
      return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => body,
      } as unknown as Response;
    }

    beforeEach(() => {
      // Pairing only matters in a production build (dev has a sync token).
      vi.stubEnv('DEV', false);
      _resetAuthTokenCache();
    });

    it('detects a ?pair= code and strips it from the URL', () => {
      setUrl('/?pair=abc123&keep=1');
      initAuthToken();
      expect(hasPairCode()).toBe(true);
      expect(window.location.search).toBe('?keep=1');
    });

    it('exchanges the pair code at POST /pair and caches the returned token', async () => {
      setUrl('/?pair=paircode');
      const fetchFn = mockFetchOnce(() => jsonResponse(200, { token: 'paired-token' }));

      const token = await ensureAuthTokenReady();
      expect(token).toBe('paired-token');

      // The exchange hit /pair with the code in the JSON body.
      expect(fetchFn).toHaveBeenCalledTimes(1);
      const [url, init] = fetchFn.mock.calls[0];
      expect(url).toBe('/pair');
      expect(JSON.parse((init as RequestInit).body as string)).toEqual({ code: 'paircode' });

      // Subsequent connections reuse the paired token.
      expect(getAuthToken()).toBe('paired-token');
      expect(authSubprotocols()).toEqual([AUTH_SUBPROTOCOL, 'paired-token']);
      expect(getPairingStatus().state).toBe('paired');
    });

    it('redeems the pair code on a fresh local first-load (empty localStorage)', async () => {
      // The launcher embeds `?pair=<code>` for the LOCAL webview too. With an
      // empty localStorage and a production build, ensureAuthTokenReady must
      // redeem the code and return the token (no ?token= shortcut exists).
      expect(window.localStorage.getItem('ccg-auth-token')).toBeNull();
      setUrl('/?pair=local-first-load');
      const fetchFn = mockFetchOnce(() => jsonResponse(200, { token: 'local-token' }));

      // Synchronous resolution is empty — the token only arrives via /pair.
      expect(getAuthToken()).toBe('');

      const token = await ensureAuthTokenReady();
      expect(token).toBe('local-token');
      expect(fetchFn).toHaveBeenCalledTimes(1);
      expect(getAuthToken()).toBe('local-token');
    });

    it('only POSTs once even across repeated ensureAuthTokenReady calls', async () => {
      setUrl('/?pair=paircode');
      const fetchFn = mockFetchOnce(() => jsonResponse(200, { token: 'paired-token' }));

      const [a, b] = await Promise.all([ensureAuthTokenReady(), ensureAuthTokenReady()]);
      expect(a).toBe('paired-token');
      expect(b).toBe('paired-token');
      await ensureAuthTokenReady();
      expect(fetchFn).toHaveBeenCalledTimes(1);
    });

    it('surfaces a "failed/expired" state on 401 and returns no token', async () => {
      // A 401 is now given a short grace period first, in case a sibling panel is
      // mid-redeem of the same single-use code (see "concurrent panels" below).
      // Nothing publishes a token here, so the wait must elapse before the
      // failure is declared — fake timers keep the test instant.
      vi.useFakeTimers();
      try {
        setUrl('/?pair=stale');
        mockFetchOnce(() => jsonResponse(401, { error: 'Invalid or expired pairing code' }));

        const pending = ensureAuthTokenReady();
        await vi.advanceTimersByTimeAsync(11_000);

        await expect(pending).resolves.toBe('');
        expect(getPairingStatus()).toEqual({ state: 'failed', reason: 'expired' });
      } finally {
        vi.useRealTimers();
      }
    });

    it('surfaces a "failed/locked" state on 429', async () => {
      setUrl('/?pair=stale');
      mockFetchOnce(() => jsonResponse(429, { error: 'Too many attempts' }));

      const token = await ensureAuthTokenReady();
      expect(token).toBe('');
      expect(getPairingStatus()).toEqual({ state: 'failed', reason: 'locked' });
    });

    it('surfaces a "failed/network" state when the request throws', async () => {
      setUrl('/?pair=stale');
      mockFetchOnce(() => Promise.reject(new Error('offline')));

      const token = await ensureAuthTokenReady();
      expect(token).toBe('');
      expect(getPairingStatus()).toEqual({ state: 'failed', reason: 'network' });
    });

    it('a validated localStorage token wins over any ?pair= (no pairing round-trip)', async () => {
      window.localStorage.setItem('ccg-auth-token', 'stored-token');
      setUrl('/?pair=ignored');
      const fetchFn = mockFetchOnce(() => jsonResponse(200, { token: 'should-not-be-used' }));

      const token = await ensureAuthTokenReady();
      expect(token).toBe('stored-token');
      expect(fetchFn).not.toHaveBeenCalled();
    });

    it('a second panel reuses the shared localStorage token even when its URL carries the already-consumed initial pair code (no 403)', async () => {
      // localStorage is shared across JCEF panels of the same origin. Panel 1
      // paired on first launch and persisted the token; Panel 2 (a new editor
      // tab) opens with the SAME, now-spent initial ?pair= code in its URL. It
      // must reuse the shared token and NEVER re-redeem the consumed code —
      // re-redeeming would 401 and surface the "403 · Forbidden" block screen.
      window.localStorage.setItem('ccg-auth-token', 'host-token');
      setUrl('/?pair=already-consumed');
      const fetchFn = mockFetchOnce(() => jsonResponse(401, { error: 'invalid' }));

      const token = await ensureAuthTokenReady();
      expect(token).toBe('host-token');
      expect(fetchFn).not.toHaveBeenCalled();
    });

    it('a stray ?token= does NOT short-circuit pairing (it is ignored)', async () => {
      // Both params present: `?token=` is ignored, `?pair=` still redeems.
      setUrl('/?token=ignored&pair=realcode');
      const fetchFn = mockFetchOnce(() => jsonResponse(200, { token: 'paired-token' }));

      const token = await ensureAuthTokenReady();
      expect(token).toBe('paired-token');
      expect(fetchFn).toHaveBeenCalledTimes(1);
      const [, init] = fetchFn.mock.calls[0];
      expect(JSON.parse((init as RequestInit).body as string)).toEqual({ code: 'realcode' });
    });

    // ── Losing the race for the single-use code ───────────────────────────────
    // The IDE restores a split by reopening BOTH panes at once, each in its own
    // JCEF browser context with the same `?pair=` code in the URL. One redeems
    // it; the other gets 401 and must NOT be treated as unauthorized — it waits
    // for the winner to publish the validated token (#302).
    describe('concurrent panels sharing one single-use code', () => {
      it('adopts the token a sibling panel publishes after losing the redeem race', async () => {
        setUrl('/?pair=sharedcode');
        mockFetchOnce(() => jsonResponse(401, { error: 'invalid' }));

        const pending = ensureAuthTokenReady();

        // The winning panel finishes its handshake and persists what it got.
        window.localStorage.setItem('ccg-auth-token', 'winner-token');
        window.dispatchEvent(
          new StorageEvent('storage', { key: 'ccg-auth-token', newValue: 'winner-token' }),
        );

        await expect(pending).resolves.toBe('winner-token');
        // Adopting a peer's token counts as paired — no "403 / rescan the QR".
        expect(getPairingStatus().state).toBe('paired');
      });

      it('does not re-POST the consumed code while waiting for the sibling', async () => {
        setUrl('/?pair=sharedcode');
        const fetchFn = mockFetchOnce(() => jsonResponse(401, { error: 'invalid' }));

        const pending = ensureAuthTokenReady();
        window.localStorage.setItem('ccg-auth-token', 'winner-token');
        window.dispatchEvent(
          new StorageEvent('storage', { key: 'ccg-auth-token', newValue: 'winner-token' }),
        );
        await pending;

        // Retrying would burn a failed-attempt slot toward the backend lockout,
        // and a consumed code can never succeed anyway.
        expect(fetchFn).toHaveBeenCalledTimes(1);
      });

      it('still reports failure when no sibling ever publishes a token', async () => {
        vi.useFakeTimers();
        try {
          setUrl('/?pair=deadcode');
          mockFetchOnce(() => jsonResponse(401, { error: 'invalid' }));

          const pending = ensureAuthTokenReady();
          await vi.advanceTimersByTimeAsync(11_000);

          await expect(pending).resolves.toBe('');
          // A genuinely expired code must still surface as a failure.
          expect(getPairingStatus().state).toBe('failed');
        } finally {
          vi.useRealTimers();
        }
      });

      it('takes an already-published sibling token without waiting at all', async () => {
        vi.useFakeTimers();
        try {
          setUrl('/?pair=sharedcode');
          mockFetchOnce(() => jsonResponse(401, { error: 'invalid' }));
          // The sibling won before this panel even POSTed.
          window.localStorage.setItem('ccg-auth-token', 'already-there');

          await expect(ensureAuthTokenReady()).resolves.toBe('already-there');
        } finally {
          vi.useRealTimers();
        }
      });
    });
  });
});
