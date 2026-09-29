import { describe, it, expect } from 'vitest';
import {
  TunnelPairingStore,
  buildPairingUrl,
  PAIRING_CODE_TTL_MS,
  PAIRING_MAX_ATTEMPTS,
  PAIRING_LOCKOUT_MS,
  INITIAL_PAIR_CODE_TTL_MS,
  MAX_LIVE_LOCAL_CODES,
} from '../tunnel-pairing';

// Unit tests for the short-lived one-time pairing store that backs the
// Remote-Control tunnel (WhatsApp-Web "link a device" model). A fake clock is
// injected so TTL / lockout behavior is deterministic and does not depend on
// real wall-clock time.

const TOKEN = 'the-real-per-launch-token';

function makeStore(startNow = 1_000_000) {
  let now = startNow;
  const store = new TunnelPairingStore({
    token: TOKEN,
    now: () => now,
  });
  return {
    store,
    advance: (ms: number) => {
      now += ms;
    },
    setNow: (v: number) => {
      now = v;
    },
  };
}

describe('TunnelPairingStore.issueCode', () => {
  it('generates a high-entropy URL-safe code', () => {
    const { store } = makeStore();
    const code = store.issueCode();
    // base64url alphabet only, and long enough to resist brute force.
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(code.length).toBeGreaterThanOrEqual(22);
  });

  it('rotates the active code on re-issue (old code no longer redeems)', () => {
    const { store } = makeStore();
    const first = store.issueCode();
    const second = store.issueCode();
    expect(second).not.toBe(first);

    // The old code is dead; only the freshly-issued one works.
    expect(store.redeem(first)).toEqual({ ok: false, reason: 'invalid' });
    expect(store.redeem(second)).toEqual({ ok: true, token: TOKEN });
  });
});

describe('TunnelPairingStore.redeem — happy path + single use', () => {
  it('returns the token for the active, unexpired code', () => {
    const { store } = makeStore();
    const code = store.issueCode();
    expect(store.redeem(code)).toEqual({ ok: true, token: TOKEN });
  });

  it('consumes the code so a second redeem of the same code fails', () => {
    const { store } = makeStore();
    const code = store.issueCode();
    expect(store.redeem(code).ok).toBe(true);
    // Single-use: immediately invalidated after a successful exchange.
    expect(store.redeem(code)).toEqual({ ok: false, reason: 'invalid' });
  });
});

describe('TunnelPairingStore.redeem — TTL expiry', () => {
  it('rejects a code once its TTL has elapsed', () => {
    const { store, advance } = makeStore();
    const code = store.issueCode();
    advance(PAIRING_CODE_TTL_MS + 1);
    expect(store.redeem(code)).toEqual({ ok: false, reason: 'expired' });
  });

  it('accepts a code right up to the edge of its TTL', () => {
    const { store, advance } = makeStore();
    const code = store.issueCode();
    advance(PAIRING_CODE_TTL_MS - 1);
    expect(store.redeem(code)).toEqual({ ok: true, token: TOKEN });
  });
});

describe('TunnelPairingStore.redeem — wrong code', () => {
  it('rejects a wrong code as invalid without consuming the real one', () => {
    const { store } = makeStore();
    const code = store.issueCode();
    expect(store.redeem('not-the-code')).toEqual({ ok: false, reason: 'invalid' });
    // The real code still works (wrong guesses must not consume it).
    expect(store.redeem(code)).toEqual({ ok: true, token: TOKEN });
  });

  it('rejects when no code has ever been issued', () => {
    const { store } = makeStore();
    expect(store.redeem('anything')).toEqual({ ok: false, reason: 'invalid' });
  });
});

describe('TunnelPairingStore.redeem — rate-limit / lockout', () => {
  it('locks out after PAIRING_MAX_ATTEMPTS failed attempts', () => {
    const { store } = makeStore();
    store.issueCode();
    for (let i = 0; i < PAIRING_MAX_ATTEMPTS - 1; i++) {
      expect(store.redeem('wrong')).toEqual({ ok: false, reason: 'invalid' });
    }
    // The attempt that hits the threshold flips into lockout.
    expect(store.redeem('wrong')).toEqual({ ok: false, reason: 'locked' });
  });

  it('rejects even the CORRECT code while locked (brute-force resistance)', () => {
    const { store } = makeStore();
    const code = store.issueCode();
    for (let i = 0; i < PAIRING_MAX_ATTEMPTS; i++) store.redeem('wrong');
    // Locked → the real code is refused too.
    expect(store.redeem(code)).toEqual({ ok: false, reason: 'locked' });
  });

  it('lifts the lockout after the cooldown, and a fresh code works again', () => {
    const { store, advance } = makeStore();
    store.issueCode();
    for (let i = 0; i < PAIRING_MAX_ATTEMPTS; i++) store.redeem('wrong');
    expect(store.redeem('wrong')).toEqual({ ok: false, reason: 'locked' });

    advance(PAIRING_LOCKOUT_MS + 1);
    // Operator re-issues after the cooldown; the new code redeems cleanly.
    const fresh = store.issueCode();
    expect(store.redeem(fresh)).toEqual({ ok: true, token: TOKEN });
  });

  it('re-issuing clears the failed-attempt counter', () => {
    const { store } = makeStore();
    store.issueCode();
    for (let i = 0; i < PAIRING_MAX_ATTEMPTS - 1; i++) store.redeem('wrong');
    // Operator rotates the code before lockout — counter resets.
    const fresh = store.issueCode();
    // A single wrong guess must not immediately lock (counter was reset).
    expect(store.redeem('wrong')).toEqual({ ok: false, reason: 'invalid' });
    expect(store.redeem(fresh)).toEqual({ ok: true, token: TOKEN });
  });
});

describe('TunnelPairingStore.seedCode — launcher-provided initial local code', () => {
  it('redeems the seeded code for the token and consumes it (single-use)', () => {
    const { store } = makeStore();
    store.seedCode('launcher-initial-code');
    expect(store.redeem('launcher-initial-code')).toEqual({ ok: true, token: TOKEN });
    // Single-use: a second redeem of the same seeded code fails.
    expect(store.redeem('launcher-initial-code')).toEqual({ ok: false, reason: 'invalid' });
  });

  it('rejects a wrong code without consuming the seeded one', () => {
    const { store } = makeStore();
    store.seedCode('launcher-initial-code');
    expect(store.redeem('nope')).toEqual({ ok: false, reason: 'invalid' });
    // The seeded code still works (wrong guesses must not consume it).
    expect(store.redeem('launcher-initial-code')).toEqual({ ok: true, token: TOKEN });
  });

  it('honors the default INITIAL_PAIR_CODE_TTL_MS via the injected clock', () => {
    const { store, advance } = makeStore();
    store.seedCode('launcher-initial-code');
    // Just inside the generous local TTL → still valid.
    advance(INITIAL_PAIR_CODE_TTL_MS - 1);
    // Re-seed to reset the clock reference for the expiry-edge assertion below.
    // (Redeeming here would consume it, so we assert validity indirectly via a
    // fresh seed + full-TTL advance.)
    expect(store.hasActiveCode()).toBe(true);

    store.seedCode('second-initial-code');
    advance(INITIAL_PAIR_CODE_TTL_MS + 1);
    expect(store.redeem('second-initial-code')).toEqual({ ok: false, reason: 'expired' });
  });

  it('accepts an explicit ttlMs override', () => {
    const { store, advance } = makeStore();
    store.seedCode('short-lived', 1_000);
    advance(1_001);
    expect(store.redeem('short-lived')).toEqual({ ok: false, reason: 'expired' });
  });

  it('clears any prior failed-attempt counter and lock (like issueCode)', () => {
    const { store } = makeStore();
    store.issueCode();
    for (let i = 0; i < PAIRING_MAX_ATTEMPTS; i++) store.redeem('wrong'); // engage lockout
    // Seeding a fresh code must clear the lock so the new code redeems cleanly.
    store.seedCode('post-lock-code');
    expect(store.redeem('post-lock-code')).toEqual({ ok: true, token: TOKEN });
  });

  it('INITIAL_PAIR_CODE_TTL_MS is more generous than the tunnel code TTL', () => {
    // The seeded local code tolerates a slow first load; it stays single-use.
    expect(INITIAL_PAIR_CODE_TTL_MS).toBeGreaterThan(PAIRING_CODE_TTL_MS);
  });
});

describe('TunnelPairingStore.issueLocalCode — a code per webview load', () => {
  it('keeps every issued local code redeemable, each exactly once', () => {
    // One code per backend START meant the second panel of a restored split, and
    // every later reload, had nothing left to redeem and could not pair until the
    // backend was restarted (issue #479). One code per LOAD is the fix, and it
    // only works if minting one does not revoke the others.
    const { store } = makeStore();
    const first = store.issueLocalCode();
    const second = store.issueLocalCode();
    expect(second).not.toBe(first);

    expect(store.redeem(first)).toEqual({ ok: true, token: TOKEN });
    expect(store.redeem(second)).toEqual({ ok: true, token: TOKEN });
    // Still single-use apiece.
    expect(store.redeem(second)).toEqual({ ok: false, reason: 'invalid' });
  });

  it('does not revoke the code the launcher seeded at startup', () => {
    const { store } = makeStore();
    store.seedCode('launcher-initial-code');
    store.issueLocalCode();

    expect(store.redeem('launcher-initial-code')).toEqual({ ok: true, token: TOKEN });
  });

  it('gives each local code its own expiry', () => {
    const { store, advance } = makeStore();
    const early = store.issueLocalCode();
    advance(INITIAL_PAIR_CODE_TTL_MS - 1_000);
    const late = store.issueLocalCode();

    advance(2_000);

    expect(store.redeem(early)).toEqual({ ok: false, reason: 'expired' });
    expect(store.redeem(late)).toEqual({ ok: true, token: TOKEN });
  });

  it('holds no more than MAX_LIVE_LOCAL_CODES, dropping the oldest first', () => {
    const { store } = makeStore();
    const codes = Array.from({ length: MAX_LIVE_LOCAL_CODES + 1 }, () => store.issueLocalCode());

    expect(store.liveCodeCount()).toBe(MAX_LIVE_LOCAL_CODES);
    // The oldest was evicted; everything since then still pairs.
    expect(store.redeem(codes[0])).toEqual({ ok: false, reason: 'invalid' });
    expect(store.redeem(codes[codes.length - 1])).toEqual({ ok: true, token: TOKEN });
  });

  it('burns every live code when the lockout engages', () => {
    const { store } = makeStore();
    const local = store.issueLocalCode();
    const tunnel = store.issueCode();
    for (let i = 0; i < PAIRING_MAX_ATTEMPTS; i++) store.redeem('wrong');

    expect(store.liveCodeCount()).toBe(0);
    // Refused while locked, and still gone once the cooldown lifts.
    expect(store.redeem(local)).toEqual({ ok: false, reason: 'locked' });
    expect(store.redeem(tunnel)).toEqual({ ok: false, reason: 'locked' });
  });
});

describe('TunnelPairingStore — tunnel rotation versus local codes', () => {
  it('rotating the QR revokes the previous QR only', () => {
    // Re-issuing the tunnel code is the operator saying the old QR is not to be
    // trusted. It says nothing about the panels they have open, and taking those
    // codes away would strand a panel that is loading at that moment.
    const { store } = makeStore();
    const panel = store.issueLocalCode();
    const firstQr = store.issueCode();
    const secondQr = store.issueCode();

    expect(store.redeem(firstQr)).toEqual({ ok: false, reason: 'invalid' });
    expect(store.redeem(panel)).toEqual({ ok: true, token: TOKEN });
    expect(store.redeem(secondQr)).toEqual({ ok: true, token: TOKEN });
  });

  it('minting a local code leaves the operator\'s QR alone', () => {
    const { store } = makeStore();
    const qr = store.issueCode();
    store.issueLocalCode();

    expect(store.redeem(qr)).toEqual({ ok: true, token: TOKEN });
  });
});

describe('TunnelPairingStore.hasActiveCode', () => {
  it('reflects issue → expiry → re-issue lifecycle', () => {
    const { store, advance } = makeStore();
    expect(store.hasActiveCode()).toBe(false);
    store.issueCode();
    expect(store.hasActiveCode()).toBe(true);
    advance(PAIRING_CODE_TTL_MS + 1);
    expect(store.hasActiveCode()).toBe(false);
  });

  it('is false right after a successful redeem (consumed)', () => {
    const { store } = makeStore();
    const code = store.issueCode();
    store.redeem(code);
    expect(store.hasActiveCode()).toBe(false);
  });
});

describe('buildPairingUrl', () => {
  it('appends ?pair=<code> to the tunnel base, tolerating a trailing slash', () => {
    expect(buildPairingUrl('https://abc.trycloudflare.com', 'CODE123')).toBe(
      'https://abc.trycloudflare.com/?pair=CODE123',
    );
    expect(buildPairingUrl('https://abc.trycloudflare.com/', 'CODE123')).toBe(
      'https://abc.trycloudflare.com/?pair=CODE123',
    );
  });

  it('URL-encodes the pairing code', () => {
    // base64url never yields reserved chars, but encode defensively anyway.
    const url = buildPairingUrl('https://abc.trycloudflare.com', 'a b+c');
    expect(url).toBe('https://abc.trycloudflare.com/?pair=a%20b%2Bc');
  });

  it('never embeds the raw auth token', () => {
    const url = buildPairingUrl('https://abc.trycloudflare.com', 'CODE');
    expect(url).not.toContain('token');
  });
});
