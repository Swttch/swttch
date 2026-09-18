import { describe, it, expect, vi, afterEach } from 'vitest';

const proxiedRequest = vi.hoisted(() => vi.fn());

// The five outbound requests this backend makes of its own no longer go through the global
// fetch, which ignores HTTP_PROXY — so the stub moves to the client that replaced it.
vi.mock('../outbound-proxy', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../outbound-proxy')>()),
  proxiedRequest,
}));


// http is allowed for loopback (local dev/testing) — pin announcementsUrl to a
// localhost http endpoint and assert the guard lets the fetch through.
vi.mock('../../../config/environment', () => ({
  announcementsUrl: 'http://localhost:8080/api/announcements',
}));
vi.mock('../settings', () => ({
  readMergedSettings: vi.fn(async () => ({ settings: { uiLanguage: 'english' }, overrides: [] })),
}));
vi.mock('../../handlers/getVersion', () => ({ getPluginVersion: vi.fn(() => '9.9.9') }));

import { fetchAnnouncements } from '../announcements';

describe('fetchAnnouncements with an http://localhost delivery URL', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    // The fetch these tests used to stub is gone; the transport is a module mock now, and
    // `unstubAllGlobals` does not reach it. Leaving it pointed at the previous test's spy is
    // how one test's request gets counted against the next one.
    proxiedRequest.mockReset();
  });

  it('allows http on loopback and performs the fetch', async () => {
    const fetchSpy = vi.fn((_url: string, _init?: unknown) =>
      Promise.resolve({
        ok: true,
        status: 200,
        body: JSON.stringify({ schemaVersion: 1, announcements: [] }),
      }),
    );
    proxiedRequest.mockImplementation(fetchSpy);

    const result = await fetchAnnouncements();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(result.announcements).toEqual([]);
  });
});
