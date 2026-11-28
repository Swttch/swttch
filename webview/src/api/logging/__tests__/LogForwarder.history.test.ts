import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// `start()` opens the /logs control socket; the history buffer under test has
// nothing to do with it, so stub the transport out entirely.
vi.mock('../../bridge/authToken', () => ({
  ensureAuthTokenReady: () => new Promise(() => {}), // never resolves — no socket
  authSubprotocols: () => [],
  isRemoteBlocked: () => false,
}));

import { LogForwarder, OMITTED_MARK, OMITTED_NOTICE } from '../LogForwarder';

describe('LogForwarder history buffer', () => {
  let forwarder: LogForwarder;
  const realConsole = { ...console };

  beforeEach(() => {
    // The forwarder hands every line on to the console it replaced; keep these tests' lines off the screen.
    console.log = () => {};
    console.warn = () => {};
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

  // Long enough to be cut to the longest a line may be, so 2000 of them are well past the 32 MB budget.
  const longLine = 'x'.repeat(40 * 1024);

  it('evicts the oldest entries once the byte budget is exceeded', () => {
    for (let i = 0; i < 2000; i++) console.log(`<${i}>${longLine}`);

    const count = forwarder.getHistoryCount();
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThan(2000); // something was dropped
    // Eviction is from the front, so the newest line must survive.
    const text = forwarder.getHistoryText();
    expect(text).toContain('<1999>');
    expect(text).not.toContain('<0>');
  });

  // Issue #714: taking entries off the front one at a time moves every entry left behind, once per entry taken.
  // With hundreds of thousands of short lines that held the page for a minute. A full history makes room for many
  // lines at once, so the lines that follow cost nothing.
  it('makes room for many lines at once when the budget is reached', () => {
    let evictions = 0;
    let previous = 0;
    for (let i = 0; i < 2000; i++) {
      console.log(`<${i}>${longLine}`);
      const count = forwarder.getHistoryCount();
      if (count <= previous) evictions++;
      previous = count;
    }

    // About 1000 lines fit, so another 1000 go past the budget. One eviction for every one of them is what is
    // being ruled out; making room for a tenth of the budget at a time needs about ten.
    expect(evictions).toBeGreaterThan(0);
    expect(evictions).toBeLessThan(20);
  });

  // Issue #714: a click on a chat entry logs every loaded message. Writing all of it out froze the page.
  it('stops reading a huge value once it is too long to be logged', () => {
    let reads = 0;
    const messages = Array.from({ length: 100_000 }, (_, i) => ({
      get text() {
        reads++;
        return `message ${i} ${'y'.repeat(100)}`;
      },
    }));

    console.log(messages);

    // A megabyte holds under 10,000 of these.
    expect(reads).toBeLessThan(20_000);
    expect(forwarder.getHistoryText()).toContain(OMITTED_MARK);
  });

  it('keeps the beginning of a long value', () => {
    console.log({ body: 'z'.repeat(100 * 1024) }, 378);

    const text = forwarder.getHistoryText();
    expect(text).toContain('{"body":"zzz');
    expect(text).toContain('… [truncated] 378');
    expect(text).not.toContain(OMITTED_NOTICE);
    expect(text.length).toBeLessThan(40 * 1024);
  });

  it('leaves out a value over a megabyte, keeps the others, and says once how to get it', () => {
    console.log({ body: 'z'.repeat(2 * 1024 * 1024) }, 378, 'after the object');

    const text = forwarder.getHistoryText();
    expect(text).toContain(`${OMITTED_MARK} 378 after the object`);
    expect(text).not.toContain('zzz');
    expect(text.split(OMITTED_NOTICE)).toHaveLength(2);
    expect(forwarder.getHistoryCount()).toBe(2);
  });

  it('leaves out a text over a megabyte the same way', () => {
    console.log('z'.repeat(2 * 1024 * 1024));

    const text = forwarder.getHistoryText();
    expect(text).toContain(OMITTED_MARK);
    expect(text).toContain(OMITTED_NOTICE);
    expect(text).not.toContain('zzz');
  });

  it('hands the browser console the value itself', () => {
    forwarder.dispose();
    const seen: unknown[] = [];
    console.log = (...args: unknown[]) => {
      seen.push(...args);
    };
    forwarder = new LogForwarder();
    forwarder.start();
    const value = { body: 'z'.repeat(2 * 1024 * 1024) };

    console.log(value);

    expect(seen).toEqual([value]);
    expect(seen[0]).toBe(value);
  });

  it('writes a short value out in full', () => {
    console.log('state:', { a: 1, list: [1, undefined, 'two'], at: new Date(0) });

    expect(forwarder.getHistoryText()).toContain(
      'state: {"a":1,"list":[1,null,"two"],"at":"1970-01-01T00:00:00.000Z"}',
    );
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
