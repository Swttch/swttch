import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { NotificationKind, SOUND_OFF } from '@/notifications';

const notifyMock = vi.fn();

vi.mock('@/notifications', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/notifications')>();
  return {
    ...actual,
    notify: (...args: unknown[]) => notifyMock(...args),
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
  notifyMock.mockReset();
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
    renderHook(() => useDocumentTitle('My Session', false, false, SOUND_OFF, null, false));
    expect(document.title).toBe('My Session');
  });

  // 로딩 중(isResetSession=false) 일시 null: 캐시된 탭 제목을 덮어쓰지 않는다
  it('leaves the existing tab title untouched when title is null', () => {
    // A null title means the session is still loading. The hook must NOT fall
    // back to APP_NAME here — doing so would clobber the cached tab title the
    // JetBrains side restores from EditorTabStateService, flashing "Claude Code"
    // mid-load (see useDocumentTitle.ts).
    document.title = 'Cached Session';
    renderHook(() => useDocumentTitle(null, false, false, SOUND_OFF, null, false));
    expect(document.title).toBe('Cached Session');
  });

  // 버그 2 회귀 방지: title=null이어도 isResetSession=true이면 APP_NAME으로 reset
  it('resets document.title to APP_NAME when title is null and isResetSession is true', () => {
    document.title = 'Old Session';
    renderHook(() => useDocumentTitle(null, true, false, SOUND_OFF, null, false));
    expect(document.title).toBe('Claude Code');
  });

  // 회귀 방지: title=null이고 isResetSession=false이면 기존 제목 유지(캐시 보호)
  it('does not change document.title when title is null and isResetSession is false', () => {
    document.title = 'Cached Session';
    renderHook(() => useDocumentTitle(null, false, false, SOUND_OFF, null, false));
    expect(document.title).toBe('Cached Session');
  });

  it('calls notify(SESSION_COMPLETE) when streaming ends while hidden', () => {
    setHidden(true);
    const { rerender } = renderHook(
      ({ streaming }) => useDocumentTitle('Session A', false, streaming, SOUND_OFF, null, false),
      { initialProps: { streaming: true } },
    );

    notifyMock.mockReset();
    rerender({ streaming: false });

    expect(notifyMock).toHaveBeenCalledTimes(1);
    expect(notifyMock).toHaveBeenCalledWith(
      NotificationKind.SESSION_COMPLETE,
      { sessionTitle: 'Session A' },
      SOUND_OFF,
    );
  });

  it('does NOT call notify when streaming ends while tab is visible', () => {
    setHidden(false);
    const { rerender } = renderHook(
      ({ streaming }) => useDocumentTitle('Session A', false, streaming, SOUND_OFF, null, false),
      { initialProps: { streaming: true } },
    );

    notifyMock.mockReset();
    rerender({ streaming: false });

    expect(notifyMock).not.toHaveBeenCalled();
  });

  it('passes the SOUND_OFF selection through to notify()', () => {
    setHidden(true);
    const { rerender } = renderHook(
      ({ streaming }) => useDocumentTitle('Session A', false, streaming, SOUND_OFF, null, false),
      { initialProps: { streaming: true } },
    );

    notifyMock.mockReset();
    rerender({ streaming: false });

    expect(notifyMock).toHaveBeenCalledWith(
      NotificationKind.SESSION_COMPLETE,
      { sessionTitle: 'Session A' },
      SOUND_OFF,
    );
  });

  it('passes a backend soundId through to notify()', () => {
    setHidden(true);
    const { rerender } = renderHook(
      ({ streaming }) => useDocumentTitle('Session A', false, streaming, 'Glass', null, false),
      { initialProps: { streaming: true } },
    );

    notifyMock.mockReset();
    rerender({ streaming: false });

    expect(notifyMock).toHaveBeenCalledWith(
      NotificationKind.SESSION_COMPLETE,
      { sessionTitle: 'Session A' },
      'Glass',
    );
  });

  it('uses the latest soundSelection captured before the streaming-end transition', () => {
    setHidden(true);
    const { rerender } = renderHook(
      ({ streaming, sound }) => useDocumentTitle('Session A', false, streaming, sound, null, false),
      { initialProps: { streaming: true, sound: SOUND_OFF as string } },
    );

    // User changes the preference mid-stream.
    rerender({ streaming: true, sound: 'Ping' });

    notifyMock.mockReset();
    rerender({ streaming: false, sound: 'Ping' });

    expect(notifyMock).toHaveBeenCalledWith(
      NotificationKind.SESSION_COMPLETE,
      { sessionTitle: 'Session A' },
      'Ping',
    );
  });

  it('calls notify(STREAM_ERROR) when streaming ends with an error while hidden', () => {
    setHidden(true);
    const err = new Error('boom');
    const { rerender } = renderHook(
      ({ streaming, error }) => useDocumentTitle('Session A', false, streaming, SOUND_OFF, error, false),
      { initialProps: { streaming: true, error: null as Error | null } },
    );

    notifyMock.mockReset();
    rerender({ streaming: false, error: err });

    expect(notifyMock).toHaveBeenCalledTimes(1);
    expect(notifyMock).toHaveBeenCalledWith(
      NotificationKind.STREAM_ERROR,
      { sessionTitle: 'Session A' },
      SOUND_OFF,
    );
  });

  it('does NOT call notify on error transitions while tab is visible', () => {
    setHidden(false);
    const err = new Error('boom');
    const { rerender } = renderHook(
      ({ streaming, error }) => useDocumentTitle('Session A', false, streaming, SOUND_OFF, error, false),
      { initialProps: { streaming: true, error: null as Error | null } },
    );

    notifyMock.mockReset();
    rerender({ streaming: false, error: err });

    expect(notifyMock).not.toHaveBeenCalled();
  });
});

describe('useDocumentTitle – JCEF environment (Notification API unavailable)', () => {
  // In this describe we keep the existing mock wiring but remove window.Notification
  // to simulate the JCEF environment. The mock notify() delegates to notifyMock(),
  // but notify.ts itself is NOT called here — what matters is that useDocumentTitle
  // calls through to the notify stub without throwing, and that the favicon swap
  // (pure DOM) still works correctly.

  let originalNotification: typeof window.Notification | undefined;
  let faviconLink: HTMLLinkElement;

  beforeEach(() => {
    notifyMock.mockReset();

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
      ({ streaming }) => useDocumentTitle('Test session', false, streaming, SOUND_OFF, null, false),
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
