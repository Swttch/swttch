import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionSearchHit } from '@/shared';
import { useChatSearch } from '../useChatSearch';

const fold = { isCollapsed: () => false, toggle: () => {} };

interface SetupOptions {
  html?: string;
  hits?: SessionSearchHit[];
  truncated?: boolean;
  /** Entries the transcript already holds. */
  loaded?: string[];
  searchFails?: boolean;
}

function setup(options: SetupOptions = {}) {
  let top = 0;
  const scroller = document.createElement('div');
  scroller.setAttribute('data-chat-scroll', '');
  Object.defineProperty(scroller, 'scrollTop', { get: () => top, set: (v: number) => (top = v) });
  Object.defineProperty(scroller, 'clientHeight', { value: 600 });
  scroller.getBoundingClientRect = () => ({ top: 0, bottom: 600, left: 0, right: 800, width: 800, height: 600, x: 0, y: 0, toJSON() {} }) as DOMRect;
  const root = document.createElement('div');
  root.innerHTML = options.html ?? '<p>needle one</p><p>needle two</p>';
  scroller.appendChild(root);
  document.body.appendChild(scroller);

  const loaded = new Set(options.loaded ?? []);
  const searchSession = vi.fn(() =>
    options.searchFails
      ? Promise.reject(new Error('boom'))
      : Promise.resolve({ hits: options.hits ?? [], total: 0, truncated: options.truncated ?? false }),
  );
  const loadThrough = vi.fn(async (_uuid: string) => {});
  const initial = {
    rootRef: { current: root },
    enabled: true,
    contentVersion: 1 as unknown,
    sessionKey: 'session-1' as string | null,
    searchSession,
    isEntryLoaded: (uuid: string) => loaded.has(uuid),
    loadThrough,
    fold,
  };
  const view = renderHook((props: typeof initial) => useChatSearch(props), { initialProps: initial });
  const search = async (query: string) => {
    act(() => view.result.current.open());
    act(() => view.result.current.setQuery(query));
    // The backend is asked once typing pauses.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
  };
  return { ...view, initial, root, loaded, searchSession, loadThrough, search, scrollTop: () => top };
}

// jsdom has no layout and no Range.getBoundingClientRect. A range with no box is
// what the hook treats as "nothing to scroll to", which is right for every test
// except the one that gives a range a place on the screen.
const noBox = () => ({ top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0, x: 0, y: 0, toJSON() {} }) as DOMRect;
const rangeBox = Range.prototype.getBoundingClientRect;

beforeEach(() => {
  vi.useFakeTimers();
  Range.prototype.getBoundingClientRect = noBox;
});

afterEach(() => {
  vi.useRealTimers();
  Range.prototype.getBoundingClientRect = rangeBox;
  document.body.innerHTML = '';
});

describe('useChatSearch: opening', () => {
  it('opens on Cmd/Ctrl+F even when the IDE browser also reports Alt', () => {
    const { result } = setup();
    // The IDE's embedded browser delivers a plain Cmd+F with altKey set.
    const press = (init: KeyboardEventInit) =>
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', cancelable: true, ...init }));
      });

    press({ metaKey: true, ctrlKey: true, altKey: true });
    expect(result.current.isOpen).toBe(true);

    act(() => result.current.close());
    press({ metaKey: true, ctrlKey: true, shiftKey: true });
    expect(result.current.isOpen).toBe(false);
  });

  it('asks for focus again on every open request, even while already open', () => {
    const { result } = setup();
    act(() => result.current.open());
    const first = result.current.focusNonce;
    act(() => result.current.open());
    expect(result.current.isOpen).toBe(true);
    expect(result.current.focusNonce).toBeGreaterThan(first);
  });
});

describe('useChatSearch: what is loaded', () => {
  it('numbers the matches in conversation order, starts at the newest, and wraps around', async () => {
    const { result, search } = setup();
    await search('needle');
    expect(result.current.total).toBe(2);
    // The search starts at the newest, which is the last in conversation order.
    expect(result.current.current).toBe(1);
    // Up the screen is "previous" and the number goes down.
    act(() => result.current.previous());
    expect(result.current.current).toBe(0);
    act(() => result.current.previous());
    expect(result.current.current).toBe(1);
    // Down the screen is "next" and the number goes up.
    act(() => result.current.next());
    expect(result.current.current).toBe(0);
    act(() => result.current.next());
    expect(result.current.current).toBe(1);
  });

  it('falls back to what is loaded when the backend cannot be asked', async () => {
    const { result, search, loadThrough } = setup({ searchFails: true });
    await search('needle');
    expect(result.current.total).toBe(2);
    expect(result.current.isLoadingHistory).toBe(false);
    expect(loadThrough).not.toHaveBeenCalled();
  });
});

describe('useChatSearch: what is not loaded', () => {
  const hits = [{ uuid: 'old', count: 3 }];

  it('adds the backend\'s count for entries that are not loaded, without loading them', async () => {
    const { result, search, loadThrough, searchSession } = setup({ hits });
    await search('needle');
    expect(searchSession).toHaveBeenCalledWith('needle');
    expect(result.current.total).toBe(5);
    // The newest match is on the screen, so nothing has to be fetched to show it.
    expect(result.current.current).toBe(4);
    expect(loadThrough).not.toHaveBeenCalled();
  });

  it('does not count a hit whose entry is already loaded twice', async () => {
    const { result, search } = setup({ hits, loaded: ['old'] });
    await search('needle');
    expect(result.current.total).toBe(2);
  });

  it('loads back to the entry only when stepping into the part that is not loaded', async () => {
    const { result, search, loadThrough } = setup({ hits });
    await search('needle');
    // Five matches in all: three in the entry that is not loaded come first in
    // the conversation, the two on the screen come last. Going up from the newest.
    act(() => result.current.previous());
    expect(result.current.current).toBe(3);
    expect(loadThrough).not.toHaveBeenCalled();
    act(() => result.current.previous());
    expect(result.current.current).toBe(2);
    expect(loadThrough).toHaveBeenCalledTimes(1);
    expect(loadThrough).toHaveBeenCalledWith('old');
  });

  it('loads at once when the loaded part holds no match at all', async () => {
    const { result, search, loadThrough } = setup({ html: '<p>nothing here</p>', hits });
    await search('needle');
    expect(result.current.total).toBe(3);
    expect(loadThrough).toHaveBeenCalledTimes(1);
    expect(loadThrough).toHaveBeenCalledWith('old');
  });

  it('reports the backend\'s limit', async () => {
    const { result, search } = setup({ hits, truncated: true });
    await search('needle');
    expect(result.current.truncated).toBe(true);
  });

  it('gives up on an entry the transcript cannot be made to hold, instead of asking for ever', async () => {
    const { result, search, loadThrough } = setup({ html: '<p>nothing here</p>', hits });
    await search('needle');
    // Each attempt needs its own render before the next one is made.
    for (let round = 0; round < 6; round++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });
    }
    expect(loadThrough.mock.calls.length).toBeLessThanOrEqual(2);
    expect(result.current.total).toBe(0);
    expect(result.current.isLoadingHistory).toBe(false);
  });

  it('waits for the page to arrive before it scrolls to the match in it', async () => {
    const original = Range.prototype.getBoundingClientRect;
    Range.prototype.getBoundingClientRect = () => ({ top: 1000, bottom: 1020, left: 0, right: 40, width: 40, height: 20, x: 0, y: 1000, toJSON() {} }) as DOMRect;
    try {
      const { result, rerender, initial, root, loaded, loadThrough, search, scrollTop } = setup({ html: '<p>nothing here</p>', hits: [{ uuid: 'old', count: 1 }] });
      loadThrough.mockImplementation(async (uuid: string) => {
        loaded.add(uuid);
        root.innerHTML = '<p>needle</p><p>nothing here</p>';
      });
      await search('needle');
      expect(loadThrough).toHaveBeenCalledWith('old');

      // The page has landed in the transcript; the load is still settling.
      rerender({ ...initial, contentVersion: 2 });
      expect(scrollTop()).toBe(0);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });
      expect(result.current.total).toBe(1);
      expect(scrollTop()).toBeGreaterThan(0);
    } finally {
      Range.prototype.getBoundingClientRect = original;
    }
  });
});
