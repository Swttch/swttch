import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// resolvePanelId identifies THIS webview panel for panel-scoped routing. Its
// behavior differs by environment, so isJetBrains is mocked per describe block.
const isJetBrainsMock = vi.hoisted(() => vi.fn());
vi.mock('../../../config/environment', () => ({
  isJetBrains: isJetBrainsMock,
}));

import { resolvePanelId, _resetPanelIdCache } from '../resolvePanelId';

// crypto.randomUUID() is typed as a UUID template-literal, so mock values must
// be UUID-shaped (five dash-separated segments) to type-check.
const GEN_UUID_1 = '11111111-1111-1111-1111-111111111111';
const GEN_UUID_2 = '22222222-2222-2222-2222-222222222222';

function setSearch(search: string): void {
  window.history.pushState({}, '', search);
}

beforeEach(() => {
  _resetPanelIdCache();
  setSearch('/');
});

afterEach(() => {
  vi.restoreAllMocks();
  setSearch('/');
});

describe('resolvePanelId', () => {
  describe('JCEF (Kotlin embeds ?panelId=)', () => {
    beforeEach(() => isJetBrainsMock.mockReturnValue(true));

    it('returns the URL query panelId and does not generate one', () => {
      setSearch('/?panelId=jcef-uuid');
      const uuidSpy = vi.spyOn(crypto, 'randomUUID');

      expect(resolvePanelId()).toBe('jcef-uuid');
      expect(uuidSpy).not.toHaveBeenCalled();
    });

    it('falls back to a generated id if the URL param is somehow absent', () => {
      vi.spyOn(crypto, 'randomUUID').mockReturnValue(GEN_UUID_1);
      expect(resolvePanelId()).toBe(GEN_UUID_1);
    });

    /**
     * The URL is not a place the id can be left. The IDE opens the page at
     * `/sessions/new?…&panelId=…`, the first message creates a session, and
     * `navigateToSession` rebuilds the URL out of `workingDir` and `rootDir`
     * alone. Reading it again after that point finds nothing and mints a
     * stranger, so the panel would be known to the backend under the id it
     * connected with and to everything else under another one.
     */
    it('keeps the id after navigation has taken it off the URL', () => {
      setSearch('/sessions/new?panelId=jcef-uuid&workingDir=/repo');
      expect(resolvePanelId()).toBe('jcef-uuid');
      const uuidSpy = vi.spyOn(crypto, 'randomUUID');

      setSearch('/sessions/abc?workingDir=/repo');

      expect(resolvePanelId()).toBe('jcef-uuid');
      expect(uuidSpy).not.toHaveBeenCalled();
    });
  });

  describe('browser (window.open copies URL + sessionStorage)', () => {
    beforeEach(() => isJetBrainsMock.mockReturnValue(false));

    it('IGNORES an inherited URL panelId and mints its OWN in-memory id', () => {
      // A new tab opened via window.open carries the opener's ?panelId=; it must
      // NOT be reused, or two tabs would collide in the backend's 1:1 index.
      setSearch('/?panelId=copied-from-opener');
      vi.spyOn(crypto, 'randomUUID').mockReturnValue(GEN_UUID_1);

      expect(resolvePanelId()).toBe(GEN_UUID_1);
    });

    it('returns the SAME id on repeated calls within one page load, generating once', () => {
      const uuidSpy = vi
        .spyOn(crypto, 'randomUUID')
        .mockReturnValueOnce(GEN_UUID_1)
        .mockReturnValueOnce(GEN_UUID_2);

      const first = resolvePanelId();
      const second = resolvePanelId();

      expect(first).toBe(GEN_UUID_1);
      expect(second).toBe(GEN_UUID_1);
      expect(uuidSpy).toHaveBeenCalledTimes(1);
    });

    it('does NOT persist to sessionStorage (it would be copied into a new tab)', () => {
      vi.spyOn(crypto, 'randomUUID').mockReturnValue(GEN_UUID_1);
      resolvePanelId();
      expect(sessionStorage.length).toBe(0);
    });

    it('a fresh JS context (a new tab) mints a DIFFERENT id', () => {
      vi.spyOn(crypto, 'randomUUID')
        .mockReturnValueOnce(GEN_UUID_1)
        .mockReturnValueOnce(GEN_UUID_2);

      const tab1 = resolvePanelId();
      // A new tab = a new JS context = reset module-level state.
      _resetPanelIdCache();
      const tab2 = resolvePanelId();

      expect(tab1).toBe(GEN_UUID_1);
      expect(tab2).toBe(GEN_UUID_2);
      expect(tab1).not.toBe(tab2);
    });
  });
});
