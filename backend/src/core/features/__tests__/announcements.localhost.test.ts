import { describe, it, expect, vi, afterEach } from 'vitest';

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
  });

  it('allows http on loopback and performs the fetch', async () => {
    const fetchSpy = vi.fn((_url: string, _init?: RequestInit) =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ schemaVersion: 1, announcements: [] }),
      }),
    );
    vi.stubGlobal('fetch', fetchSpy);

    const result = await fetchAnnouncements();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(result.announcements).toEqual([]);
  });
});
