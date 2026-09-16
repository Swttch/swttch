import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { SOUND_OFF } from '@/notifications';
import {
  FAVICON_DEFAULT,
  hasUnreadFavicon,
  isWorkingFavicon,
  restoreDefaultFavicon,
  stopWorkingFavicon,
} from '../favicon';
import { useDocumentTitle } from '../useDocumentTitle';

function setHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', {
    configurable: true,
    get: () => hidden,
  });
}

/**
 * What the tab shows while the CLI waits for the user to answer (issue #456).
 *
 * The turn has not ended during a prompt, so `isStreaming` stays true the whole
 * time. Before this, the spinner read that flag alone and kept turning — and
 * because it rewrites the favicon every frame, it also erased the unread badge
 * that was meant to tell a user who had walked away that they were being asked
 * something.
 *
 * jsdom has no canvas and no `Worker`. The canvas is stubbed so frames can be
 * baked at all, and the missing `Worker` sends the spinner's timer down its
 * main-thread fallback, which fake timers can drive.
 */
describe('useDocumentTitle – waiting for the user', () => {
  let link: HTMLLinkElement;
  let originalGetContext: typeof HTMLCanvasElement.prototype.getContext;
  let originalToDataURL: typeof HTMLCanvasElement.prototype.toDataURL;
  let frameCount = 0;

  beforeEach(() => {
    vi.useFakeTimers();
    link = document.createElement('link');
    link.rel = 'icon';
    link.href = FAVICON_DEFAULT;
    document.head.appendChild(link);

    frameCount = 0;
    originalGetContext = HTMLCanvasElement.prototype.getContext;
    originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
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
    HTMLCanvasElement.prototype.toDataURL = (() =>
      `data:image/png;base64,frame${frameCount++}`) as typeof HTMLCanvasElement.prototype.toDataURL;
  });

  afterEach(() => {
    stopWorkingFavicon();
    restoreDefaultFavicon();
    link.remove();
    HTMLCanvasElement.prototype.getContext = originalGetContext;
    HTMLCanvasElement.prototype.toDataURL = originalToDataURL;
    vi.useRealTimers();
    delete (window as unknown as Record<string, unknown>).__notifyStreamingState;
  });

  function renderAwaiting(initial: { streaming: boolean; awaiting: boolean }) {
    return renderHook(
      ({ streaming, awaiting }) =>
        useDocumentTitle('Session A', false, streaming, SOUND_OFF, null, awaiting),
      { initialProps: initial },
    );
  }

  it('stops the spinner and shows the unread badge when a prompt appears', () => {
    const { rerender } = renderAwaiting({ streaming: true, awaiting: false });
    expect(isWorkingFavicon()).toBe(true);

    rerender({ streaming: true, awaiting: true });

    expect(isWorkingFavicon()).toBe(false);
    expect(hasUnreadFavicon()).toBe(true);
  });

  // The regression itself: the badge went up and the next spinner frame wiped
  // it, so a user in another tab was never told they had been asked something.
  it('keeps the badge instead of letting spinner frames overwrite it', () => {
    const { rerender } = renderAwaiting({ streaming: true, awaiting: false });
    rerender({ streaming: true, awaiting: true });

    // Far longer than any frame interval this module uses.
    vi.advanceTimersByTime(5000);

    expect(hasUnreadFavicon()).toBe(true);
  });

  // The badge is not an unread marker here, and looking at a question is not
  // answering it.
  it('keeps the badge when the user comes back to the tab', () => {
    setHidden(true);
    const { rerender } = renderAwaiting({ streaming: true, awaiting: false });
    rerender({ streaming: true, awaiting: true });

    setHidden(false);
    document.dispatchEvent(new Event('visibilitychange'));

    expect(hasUnreadFavicon()).toBe(true);
  });

  it('turns again once the answer resumes the turn', () => {
    const { rerender } = renderAwaiting({ streaming: true, awaiting: false });
    rerender({ streaming: true, awaiting: true });

    rerender({ streaming: true, awaiting: false });

    expect(isWorkingFavicon()).toBe(true);
    expect(hasUnreadFavicon()).toBe(false);
  });

  it('falls back to the default favicon when the wait ends with the turn', () => {
    const { rerender } = renderAwaiting({ streaming: true, awaiting: false });
    rerender({ streaming: true, awaiting: true });

    rerender({ streaming: false, awaiting: false });

    expect(isWorkingFavicon()).toBe(false);
    expect(hasUnreadFavicon()).toBe(false);
  });

  it('reports `awaiting` to the IDE, so the JetBrains tabs can say the same thing', () => {
    const reports: string[] = [];
    (window as unknown as Record<string, unknown>).__notifyStreamingState = (state: string) => {
      reports.push(state);
    };

    const { rerender } = renderAwaiting({ streaming: true, awaiting: false });
    rerender({ streaming: true, awaiting: true });
    rerender({ streaming: false, awaiting: false });

    expect(reports).toEqual(['streaming', 'awaiting', 'idle']);
  });
});
