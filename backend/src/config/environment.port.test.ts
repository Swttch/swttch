import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('environment PORT handling', () => {
  const original = process.env.PORT;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    if (original === undefined) delete process.env.PORT;
    else process.env.PORT = original;
  });

  it('reads the listen port from PORT', async () => {
    process.env.PORT = '0';
    const { serverPort } = await import('./environment');
    expect(serverPort).toBe(0);
  });

  it('falls back to the default port when PORT is not set', async () => {
    delete process.env.PORT;
    const { serverPort } = await import('./environment');
    expect(serverPort).toBe(19836);
  });

  it('removes PORT from process.env so spawned children do not inherit it', async () => {
    process.env.PORT = '9999';
    await import('./environment');
    expect(process.env.PORT).toBeUndefined();
  });
});
