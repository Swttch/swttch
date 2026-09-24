import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { NotificationKind } from '@/notifications';
import { _resetRuntimeCache } from '@/config/environment';

const playSoundMock = vi.fn();
const showBannerMock = vi.fn();

vi.mock('@/notifications', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/notifications')>();
  return {
    ...actual,
    playNotificationSound: (...args: unknown[]) => playSoundMock(...args),
    showNotificationBanner: (...args: unknown[]) => showBannerMock(...args),
  };
});

// Imported AFTER the vi.mock call so the mock is wired up first.
import { useDocumentTitle } from '../useDocumentTitle';

function setHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', {
    configurable: true,
    get: () => hidden,
  });
}

beforeEach(() => {
  playSoundMock.mockReset();
  showBannerMock.mockReset();
  try {
    localStorage.clear();
  } catch {
    // ignore
  }
  setHidden(false);
});

afterEach(() => {
  setHidden(false);
});

describe('useDocumentTitle', () => {
  it('sets document.title from the session title', () => {
    renderHook(() => useDocumentTitle('My Session', false, false, null, false));
    expect(document.title).toBe('My Session');
  });

  // 로딩 중(isResetSession=false) 일시 null: 캐시된 탭 제목을 덮어쓰지 않는다
  it('leaves the existing tab title untouched when title is null', () => {
    // A null title means the session is still loading. The hook must NOT fall
    // back to APP_NAME here — doing so would clobber the cached tab title the
    // JetBrains side restores from EditorTabStateService, flashing "Claude Code"
    // mid-load (see useDocumentTitle.ts).
    document.title = 'Cached Session';
    renderHook(() => useDocumentTitle(null, false, false, null, false));
    expect(document.title).toBe('Cached Session');
  });

  // 버그 2 회귀 방지: title=null이어도 isResetSession=true이면 APP_NAME으로 reset
  it('resets document.title to APP_NAME when title is null and isResetSession is true', () => {
    document.title = 'Old Session';
    renderHook(() => useDocumentTitle(null, true, false, null, false));
    expect(document.title).toBe('Claude Code');
  });

  // 회귀 방지: title=null이고 isResetSession=false이면 기존 제목 유지(캐시 보호)
  it('does not change document.title when title is null and isResetSession is false', () => {
    document.title = 'Cached Session';
    renderHook(() => useDocumentTitle(null, false, false, null, false));
    expect(document.title).toBe('Cached Session');
  });

  it('shows the SESSION_COMPLETE banner when streaming ends while hidden', () => {
    setHidden(true);
    const { rerender } = renderHook(
      ({ streaming }) =>
        useDocumentTitle('Session A', false, streaming, null, false),
      { initialProps: { streaming: true } },
    );

    showBannerMock.mockReset();
    rerender({ streaming: false });

    expect(showBannerMock).toHaveBeenCalledTimes(1);
    expect(showBannerMock).toHaveBeenCalledWith(NotificationKind.SESSION_COMPLETE, {
      sessionTitle: 'Session A',
    });
  });

  it('does NOT show a banner when streaming ends while tab is visible', () => {
    setHidden(false);
    const { rerender } = renderHook(
      ({ streaming }) =>
        useDocumentTitle('Session A', false, streaming, null, false),
      { initialProps: { streaming: true } },
    );

    showBannerMock.mockReset();
    rerender({ streaming: false });

    expect(showBannerMock).not.toHaveBeenCalled();
  });

  it('shows the STREAM_ERROR banner when streaming ends with an error while hidden', () => {
    setHidden(true);
    const err = new Error('boom');
    const { rerender } = renderHook(
      ({ streaming, error }) =>
        useDocumentTitle('Session A', false, streaming, error, false),
      { initialProps: { streaming: true, error: null as Error | null } },
    );

    showBannerMock.mockReset();
    rerender({ streaming: false, error: err });

    expect(showBannerMock).toHaveBeenCalledTimes(1);
    expect(showBannerMock).toHaveBeenCalledWith(NotificationKind.STREAM_ERROR, {
      sessionTitle: 'Session A',
    });
  });

  it('does NOT show a banner on error transitions while tab is visible', () => {
    setHidden(false);
    const err = new Error('boom');
    const { rerender } = renderHook(
      ({ streaming, error }) =>
        useDocumentTitle('Session A', false, streaming, error, false),
      { initialProps: { streaming: true, error: null as Error | null } },
    );

    showBannerMock.mockReset();
    rerender({ streaming: false, error: err });

    expect(showBannerMock).not.toHaveBeenCalled();
  });

  it('asks for the sound at the end of a turn', () => {
    setHidden(true);
    const { rerender } = renderHook(
      ({ streaming }) =>
        useDocumentTitle('Session A', false, streaming, null, false),
      { initialProps: { streaming: true } },
    );

    playSoundMock.mockReset();
    rerender({ streaming: false });

    expect(playSoundMock).toHaveBeenCalledTimes(1);
  });

  /**
   * The reported defect, on the half of it this hook owns.
   *
   * The chat screen stays mounted under the settings overlay, so it has no
   * reason to re-read anything when the user picks a different sound there. As
   * long as it named the sound, that made it ring the old one forever. It now
   * names nothing, so there is no name here to go out of date.
   */
  it('names no sound, so nothing it read at mount can go stale', () => {
    setHidden(true);
    const { rerender } = renderHook(
      ({ streaming }) => useDocumentTitle('Session A', false, streaming, null, false),
      { initialProps: { streaming: true } },
    );

    playSoundMock.mockReset();
    rerender({ streaming: false });

    expect(playSoundMock).toHaveBeenCalledWith();
  });
});

// ---------------------------------------------------------------------------
// The sound is not a passenger on the banner.
//
// The sound must ring whether or not the session counts as unread. Before the
// split it was played at the tail of notify(), which the caller only reached
// when the banner was allowed — so a visible tab, the one case where the user
// is certainly there to hear it, was also the case where nothing played. Each
// test below puts the banner out of reach by a different route and asserts the
// sound still went out.
// ---------------------------------------------------------------------------
describe('useDocumentTitle – the end-of-turn sound is independent of the banner', () => {
  it('plays the sound when the turn ends with the tab VISIBLE (no banner)', () => {
    setHidden(false);
    const { rerender } = renderHook(
      ({ streaming }) => useDocumentTitle('Session A', false, streaming, null, false),
      { initialProps: { streaming: true } },
    );

    playSoundMock.mockReset();
    showBannerMock.mockReset();
    rerender({ streaming: false });

    expect(playSoundMock).toHaveBeenCalledTimes(1);
    expect(showBannerMock).not.toHaveBeenCalled();
  });

  it('plays the sound on an errored turn with the tab visible', () => {
    setHidden(false);
    const err = new Error('boom');
    const { rerender } = renderHook(
      ({ streaming, error }) =>
        useDocumentTitle('Session A', false, streaming, error, false),
      { initialProps: { streaming: true, error: null as Error | null } },
    );

    playSoundMock.mockReset();
    showBannerMock.mockReset();
    rerender({ streaming: false, error: err });

    expect(playSoundMock).toHaveBeenCalledTimes(1);
    expect(showBannerMock).not.toHaveBeenCalled();
  });

  it('still shows the banner when the tab is hidden', () => {
    // The mirror image of the two tests above: proves they fail for the reason
    // claimed (the gate) rather than because nothing ever raises a banner.
    setHidden(true);
    const { rerender } = renderHook(
      ({ streaming }) =>
        useDocumentTitle('Session A', false, streaming, null, false),
      { initialProps: { streaming: true } },
    );

    playSoundMock.mockReset();
    showBannerMock.mockReset();
    rerender({ streaming: false });

    expect(playSoundMock).toHaveBeenCalledTimes(1);
    expect(showBannerMock).toHaveBeenCalledTimes(1);
  });

  it('does not ring on a transition that is not the end of a turn', () => {
    // Mounting, or a re-render that does not cross streaming→idle, must stay
    // silent — otherwise "always rings" would degenerate into "rings whenever".
    setHidden(false);
    const { rerender } = renderHook(
      ({ streaming }) => useDocumentTitle('Session A', false, streaming, null, false),
      { initialProps: { streaming: false } },
    );

    expect(playSoundMock).not.toHaveBeenCalled();

    rerender({ streaming: true });
    expect(playSoundMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// The IDE keeps raising banners after its URL stops saying it is the IDE.
//
// This is the defect found on a Windows 11 machine on 2026-09-24: the banner
// arrived for the very first turn and never again. The backend log showed
// PLAY_NOTIFICATION_SOUND arriving with no SHOW_NOTIFICATION beside it, which
// says the gate between the two calls had turned false.
//
// It had. The IDE opens the page at /sessions/new?...&panelId=..., the first
// message creates a session, and `navigateToSession` rebuilds the URL with
// `workingDir` alone. The host check read `panelId` off that URL, so from the
// second turn onwards it called JCEF a browser and deferred to
// `document.hidden`, which JCEF leaves false however far away the user is.
//
// Every test below therefore runs with NO panelId on the URL and with the tab
// reporting itself visible — the state the machine was actually in — and pins
// the sound and the banner to each other, because the log's evidence was one
// going out without the other.
// ---------------------------------------------------------------------------
describe('useDocumentTitle – in the IDE after the URL has lost its panelId', () => {
  beforeEach(() => {
    (window as unknown as { __JCEF__?: boolean }).__JCEF__ = true;
    _resetRuntimeCache();
    window.history.replaceState({}, '', '/sessions/abc?workingDir=/repo');
    setHidden(false);
  });

  afterEach(() => {
    delete (window as unknown as { __JCEF__?: boolean }).__JCEF__;
    _resetRuntimeCache();
    window.history.replaceState({}, '', '/');
  });

  it('raises the banner alongside the sound when a turn ends', () => {
    const { rerender } = renderHook(
      ({ streaming }) => useDocumentTitle('Session A', false, streaming, null, false),
      { initialProps: { streaming: true } },
    );

    playSoundMock.mockReset();
    showBannerMock.mockReset();
    rerender({ streaming: false });

    expect(playSoundMock).toHaveBeenCalledTimes(1);
    expect(showBannerMock).toHaveBeenCalledTimes(1);
    expect(showBannerMock).toHaveBeenCalledWith(NotificationKind.SESSION_COMPLETE, {
      sessionTitle: 'Session A',
    });
  });

  it('raises the error banner alongside the sound when a turn fails', () => {
    const err = new Error('boom');
    const { rerender } = renderHook(
      ({ streaming, error }) => useDocumentTitle('Session A', false, streaming, error, false),
      { initialProps: { streaming: true, error: null as Error | null } },
    );

    playSoundMock.mockReset();
    showBannerMock.mockReset();
    rerender({ streaming: false, error: err });

    expect(playSoundMock).toHaveBeenCalledTimes(1);
    expect(showBannerMock).toHaveBeenCalledTimes(1);
    expect(showBannerMock).toHaveBeenCalledWith(NotificationKind.STREAM_ERROR, {
      sessionTitle: 'Session A',
    });
  });

  it('keeps raising it turn after turn, which is where the defect started', () => {
    // The first turn worked in the field and every later one did not, so one
    // transition is not enough to catch this. Three in a row are asserted.
    const { rerender } = renderHook(
      ({ streaming }) => useDocumentTitle('Session A', false, streaming, null, false),
      { initialProps: { streaming: true } },
    );

    playSoundMock.mockReset();
    showBannerMock.mockReset();

    for (let turn = 0; turn < 3; turn += 1) {
      rerender({ streaming: false });
      rerender({ streaming: true });
    }

    expect(playSoundMock).toHaveBeenCalledTimes(3);
    expect(showBannerMock).toHaveBeenCalledTimes(3);
  });
});

describe('useDocumentTitle – JCEF environment (Notification API unavailable)', () => {
  // In this describe we keep the existing mock wiring but remove window.Notification
  // to simulate the JCEF environment. The mocked banner/sound functions stand in
  // for notify.ts itself — what matters is that useDocumentTitle calls through
  // without throwing, and that the favicon swap (pure DOM) still works.

  let originalNotification: typeof window.Notification | undefined;
  let faviconLink: HTMLLinkElement;

  beforeEach(() => {
    playSoundMock.mockReset();
    showBannerMock.mockReset();

    // Stash and remove window.Notification to simulate JCEF
    originalNotification = (window as unknown as Record<string, unknown>)
      .Notification as typeof window.Notification | undefined;
    delete (window as unknown as Record<string, unknown>).Notification;

    setHidden(false);

    // Ensure a <link rel="icon"> element exists so setFavicon can operate
    faviconLink = document.createElement('link');
    faviconLink.rel = 'icon';
    faviconLink.href = '/favicon.svg';
    document.head.appendChild(faviconLink);
  });

  afterEach(() => {
    // Restore Notification
    if (originalNotification !== undefined) {
      (window as unknown as Record<string, unknown>).Notification =
        originalNotification;
    }
    faviconLink.remove();
    setHidden(false);
  });

  it('does not throw and swaps favicon when streaming ends while hidden in JCEF', () => {
    setHidden(true);

    const { rerender } = renderHook(
      ({ streaming }) =>
        useDocumentTitle('Test session', false, streaming, null, false),
      { initialProps: { streaming: true } },
    );

    // streaming-end transition: must not throw even when Notification API is absent
    expect(() => {
      rerender({ streaming: false });
    }).not.toThrow();

    // favicon swap is pure DOM — it must still work regardless of Notification API
    expect(faviconLink.href).toContain('favicon-unread.svg');
  });
});
