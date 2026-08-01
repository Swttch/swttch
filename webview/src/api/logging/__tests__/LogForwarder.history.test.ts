import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// `start()` opens the /logs control socket; the history buffer under test has
// nothing to do with it, so stub the transport out entirely.
vi.mock('../../bridge/authToken', () => ({
  ensureAuthTokenReady: () => new Promise(() => {}), // never resolves — no socket
  authSubprotocols: () => [],
  isRemoteBlocked: () => false,
}));

import { LogForwarder } from '../LogForwarder';

describe('LogForwarder history buffer', () => {
  let forwarder: LogForwarder;
  const realConsole = { ...console };

  beforeEach(() => {
    forwarder = new LogForwarder();
    forwarder.start();
  });

  afterEach(() => {
    forwarder.dispose();
    Object.assign(console, realConsole);
  });

  it('keeps far more than the 5000 lines the old cap allowed', () => {
    // The reporter's log in issue #232 stopped at exactly 4999 lines — the old
    // line cap — and the entries that mattered had already been evicted.
    for (let i = 0; i < 20000; i++) console.log(`line ${i}`);

    expect(forwarder.getHistoryCount()).toBe(20000);
    const text = forwarder.getHistoryText();
    expect(text).toContain('line 0');
    expect(text).toContain('line 19999');
  });

  it('evicts the oldest entries once the byte budget is exceeded', () => {
    // 1 MB per line: a handful of these blows past the 32 MB budget.
    const oneMb = 'x'.repeat(1024 * 1024);
    for (let i = 0; i < 40; i++) console.log(`${i}:${oneMb}`);

    const count = forwarder.getHistoryCount();
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThan(40); // something was dropped
    // Eviction is from the front, so the newest line must survive.
    expect(forwarder.getHistoryText()).toContain('39:');
  });

  it('resets the byte total when the history is cleared', () => {
    for (let i = 0; i < 100; i++) console.log(`line ${i}`);
    forwarder.clearHistory();
    expect(forwarder.getHistoryCount()).toBe(0);

    // A cleared buffer must accept a full budget again, not carry a stale total.
    for (let i = 0; i < 100; i++) console.log(`after ${i}`);
    expect(forwarder.getHistoryCount()).toBe(100);
  });
});
