import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  FAVICON_DEFAULT,
  FAVICON_UNREAD,
  hasUnreadFavicon,
  isWorkingFavicon,
  restoreDefaultFavicon,
  setUnreadFavicon,
  startWorkingFavicon,
  stopWorkingFavicon,
} from '../favicon';

let link: HTMLLinkElement;

beforeEach(() => {
  link = document.createElement('link');
  link.rel = 'icon';
  link.href = FAVICON_DEFAULT;
  document.head.appendChild(link);
});

afterEach(() => {
  link.remove();
});

describe('favicon helpers', () => {
  it('setUnreadFavicon swaps the href to the unread variant', () => {
    setUnreadFavicon();
    expect(link.href).toContain(FAVICON_UNREAD);
  });

  it('restoreDefaultFavicon swaps the href back to the default', () => {
    setUnreadFavicon();
    restoreDefaultFavicon();
    expect(link.href).toContain(FAVICON_DEFAULT);
    expect(link.href).not.toContain('favicon-unread');
  });

  it('hasUnreadFavicon reflects the live DOM state', () => {
    expect(hasUnreadFavicon()).toBe(false);
    setUnreadFavicon();
    expect(hasUnreadFavicon()).toBe(true);
    restoreDefaultFavicon();
    expect(hasUnreadFavicon()).toBe(false);
  });

  it('setUnreadFavicon is idempotent', () => {
    setUnreadFavicon();
    const after = link.href;
    setUnreadFavicon();
    expect(link.href).toBe(after);
  });
});

/**
 * The spinner the favicon wears while a response streams (issue #449).
 *
 * jsdom has neither a real canvas nor `Worker`, which is convenient here: the
 * canvas is stubbed so each frame is a distinguishable data URL, and the
 * missing `Worker` sends `startTimer` down its documented main-thread
 * fallback, which fake timers can drive. The worker path itself is not
 * exercised here; it was measured in a real browser instead.
 */
describe('working favicon spinner', () => {
  let toDataUrlCalls = 0;
  let originalGetContext: typeof HTMLCanvasElement.prototype.getContext;
  let originalToDataURL: typeof HTMLCanvasElement.prototype.toDataURL;

  beforeEach(() => {
    vi.useFakeTimers();
    toDataUrlCalls = 0;
    originalGetContext = HTMLCanvasElement.prototype.getContext;
    originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
    // Enough of a 2D context for buildFrames to run through.
    HTMLCanvasElement.prototype.getContext = (() => ({
      clearRect: () => {},
      save: () => {},
      restore: () => {},
      translate: () => {},
      rotate: () => {},
      beginPath: () => {},
      arc: () => {},
      stroke: () => {},
      strokeStyle: '',
      lineWidth: 0,
      lineCap: '',
    })) as unknown as typeof HTMLCanvasElement.prototype.getContext;
    // One distinct URL per frame, so "the frame advanced" is observable.
    HTMLCanvasElement.prototype.toDataURL = (() =>
      `data:image/png;base64,frame${toDataUrlCalls++}`) as typeof HTMLCanvasElement.prototype.toDataURL;
  });

  afterEach(() => {
    stopWorkingFavicon();
    HTMLCanvasElement.prototype.getContext = originalGetContext;
    HTMLCanvasElement.prototype.toDataURL = originalToDataURL;
    vi.useRealTimers();
  });

  it('starts on a baked frame and declares that frame\'s media type', () => {
    startWorkingFavicon();

    expect(isWorkingFavicon()).toBe(true);
    expect(link.href).toContain('data:image/png');
    // The link tag in index.html declares image/svg+xml. Leaving it that way
    // while pointing at a PNG is what stopped the spinner from rendering.
    expect(link.type).toBe('image/png');
  });

  it('advances to a different frame as time passes', () => {
    startWorkingFavicon();
    const first = link.href;

    // A full second is longer than any frame interval this module uses, so
    // this asserts advancement without restating the interval here.
    vi.advanceTimersByTime(1000);
    const second = link.href;
    expect(second).not.toBe(first);

    vi.advanceTimersByTime(1000);
    expect(link.href).not.toBe(second);
  });

  it('stops advancing and restores the default favicon', () => {
    startWorkingFavicon();
    vi.advanceTimersByTime(1000);

    stopWorkingFavicon();

    expect(isWorkingFavicon()).toBe(false);
    expect(link.href).toContain(FAVICON_DEFAULT);
    expect(link.type).toBe('image/svg+xml');

    const afterStop = link.href;
    vi.advanceTimersByTime(5000);
    expect(link.href).toBe(afterStop);
  });

  it('leaves the rotation alone when started again while already spinning', () => {
    startWorkingFavicon();
    vi.advanceTimersByTime(1000);
    const midway = link.href;

    startWorkingFavicon();

    // A second start that re-seeded would snap back to frame 0.
    expect(link.href).toBe(midway);
    // And it must not have left a second timer running: one tick, one advance.
    vi.advanceTimersByTime(1000);
    const once = link.href;
    expect(once).not.toBe(midway);
  });

  it('reuses its baked frames instead of re-baking on every run', () => {
    // Whether this run is the one that bakes depends on what ran before it, so
    // the count is read after a first start rather than assumed to be zero.
    startWorkingFavicon();
    stopWorkingFavicon();
    const afterFirstRun = toDataUrlCalls;

    startWorkingFavicon();

    expect(toDataUrlCalls).toBe(afterFirstRun);
  });

  it('hands the unread variant back to whoever sets it after the stream ends', () => {
    startWorkingFavicon();
    vi.advanceTimersByTime(1000);

    // This is the order useDocumentTitle relies on: the spinner stops first,
    // then the unread effect runs and its favicon is the one left showing.
    stopWorkingFavicon();
    setUnreadFavicon();

    expect(hasUnreadFavicon()).toBe(true);
    expect(link.type).toBe('image/svg+xml');
  });
});
