import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NotificationKind } from '../types';

// ---------------------------------------------------------------------------
// api.sounds mocking
//
// notify.ts imports `{ api }` from '@/api/ClaudeCodeApi'. We swap vi.fn's in
// for `api.sounds.playNotificationSound` and `api.sounds.play` so we can assert
// call counts/payloads without reaching across the bridge.
// ---------------------------------------------------------------------------

const playNotificationSoundMock = vi.fn();
const playMock = vi.fn();
const showNotificationMock = vi.fn();

vi.mock('@/api/ClaudeCodeApi', () => ({
  api: {
    sounds: {
      playNotificationSound: (...args: unknown[]) => playNotificationSoundMock(...args),
      play: (...args: unknown[]) => playMock(...args),
    },
    notifications: {
      show: (...args: unknown[]) => showNotificationMock(...args),
    },
  },
}));

// ---------------------------------------------------------------------------
// Notification API mocking
// ---------------------------------------------------------------------------

interface NotificationLike {
  title: string;
  options: NotificationOptions | undefined;
  onclick: (() => void) | null;
  onclose: (() => void) | null;
  close: ReturnType<typeof vi.fn<() => void>>;
}

let constructorSpy: ReturnType<typeof vi.fn<(title: string, options?: NotificationOptions) => void>>;
let createdInstances: NotificationLike[];
let requestPermissionSpy: ReturnType<typeof vi.fn<() => Promise<NotificationPermission>>>;
let beforeUnloadListeners: Array<() => void>;
let originalAddEventListener: typeof window.addEventListener;
let originalFocus: typeof window.focus;
let focusSpy: ReturnType<typeof vi.fn<() => void>>;

function installNotificationMock(permission: NotificationPermission) {
  createdInstances = [];
  constructorSpy = vi.fn<(title: string, options?: NotificationOptions) => void>();
  requestPermissionSpy = vi.fn<() => Promise<NotificationPermission>>().mockResolvedValue(permission);

  // jsdom does not provide Notification; assign a mock class.
  class MockNotification implements NotificationLike {
    static permission: NotificationPermission = permission;
    static requestPermission = requestPermissionSpy;
    title: string;
    options: NotificationOptions | undefined;
    onclick: (() => void) | null = null;
    onclose: (() => void) | null = null;
    close = vi.fn<() => void>();

    constructor(title: string, options?: NotificationOptions) {
      this.title = title;
      this.options = options;
      constructorSpy(title, options);
      createdInstances.push(this);
    }
  }

  (globalThis as unknown as { Notification: unknown }).Notification = MockNotification;
}

function uninstallNotificationMock() {
  delete (globalThis as unknown as { Notification?: unknown }).Notification;
}

// showNotificationBanner() detects the IDE (JCEF) by the marker Kotlin injects
// into the page, NOT by the presence of window.Notification and NOT by anything
// on the URL. Each test that wants the IDE path plants that marker.
//
// No cache to clear here: beforeEach calls vi.resetModules(), so every dynamic
// import below re-evaluates the environment module along with notify.ts.
function setIdeRuntime(present: boolean) {
  if (present) {
    (window as unknown as { __JCEF__?: boolean }).__JCEF__ = true;
  } else {
    delete (window as unknown as { __JCEF__?: boolean }).__JCEF__;
  }
}

beforeEach(() => {
  vi.resetModules();
  playNotificationSoundMock.mockReset();
  playNotificationSoundMock.mockResolvedValue(undefined);
  playMock.mockReset();
  playMock.mockResolvedValue(undefined);
  showNotificationMock.mockReset();
  // The backend answers "banners are wanted" unless a test says otherwise; it
  // is the one that reads that switch now.
  showNotificationMock.mockResolvedValue(true);
  beforeUnloadListeners = [];
  originalAddEventListener = window.addEventListener.bind(window);
  vi.spyOn(window, 'addEventListener').mockImplementation(((
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ) => {
    if (type === 'beforeunload' && typeof listener === 'function') {
      beforeUnloadListeners.push(listener as () => void);
      return;
    }
    originalAddEventListener(type, listener, options);
  }) as typeof window.addEventListener);

  originalFocus = window.focus.bind(window);
  focusSpy = vi.fn<() => void>();
  window.focus = focusSpy as unknown as typeof window.focus;

  // Default to standalone; IDE tests opt in via setIdeRuntime.
  setIdeRuntime(false);
});

afterEach(() => {
  vi.restoreAllMocks();
  uninstallNotificationMock();
  setIdeRuntime(false);
  window.focus = originalFocus;
});

describe('playNotificationSound()', () => {
  it('asks the backend to ring the notification sound', async () => {
    const { playNotificationSound } = await import('../notify');
    playNotificationSound();
    expect(playNotificationSoundMock).toHaveBeenCalledTimes(1);
  });

  // The name of the sound is the backend's to look up. A screen that named one
  // went on ringing whatever it had read at mount, which is the whole defect.
  it('names no sound of its own', async () => {
    const { playNotificationSound } = await import('../notify');
    playNotificationSound();
    expect(playNotificationSoundMock).toHaveBeenCalledWith();
    expect(playMock).not.toHaveBeenCalled();
  });

  // The whole point of the split: the sound is not a passenger on the banner.
  // It must not care whether a banner could have been shown, which in the
  // browser means not caring about notification permission at all.
  it('rings even when the browser never granted notification permission', async () => {
    installNotificationMock('denied');
    const { playNotificationSound } = await import('../notify');
    playNotificationSound();
    expect(playNotificationSoundMock).toHaveBeenCalledTimes(1);
  });

  it('rings even when the page has no Notification API at all', async () => {
    uninstallNotificationMock();
    const { playNotificationSound } = await import('../notify');
    playNotificationSound();
    expect(playNotificationSoundMock).toHaveBeenCalledTimes(1);
  });

  it('never raises a banner of its own', async () => {
    installNotificationMock('granted');
    const { playNotificationSound } = await import('../notify');
    playNotificationSound();
    expect(constructorSpy).not.toHaveBeenCalled();
    expect(showNotificationMock).not.toHaveBeenCalled();
  });

  it('does not propagate backend failures to the caller', async () => {
    playNotificationSoundMock.mockRejectedValueOnce(new Error('spawn failed'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { playNotificationSound } = await import('../notify');

    expect(() => playNotificationSound()).not.toThrow();

    // Allow the microtask attached to the request promise to run.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe('showNotificationBanner()', () => {
  it('delegates to api.notifications.show in the IDE', async () => {
    setIdeRuntime(true);
    uninstallNotificationMock();
    const { showNotificationBanner } = await import('../notify');
    await showNotificationBanner(NotificationKind.SESSION_COMPLETE, { sessionTitle: 'My Session' });
    expect(showNotificationMock).toHaveBeenCalledTimes(1);
    expect(showNotificationMock).toHaveBeenCalledWith({
      title: 'My Session',
      body: 'Response complete',
      // Translated here because the backend has no locale, and required because
      // the macOS notifier only listens for a click on a banner that has a
      // button. Without it a clicked banner reaches nobody.
      clickActionTitle: 'Open session',
    });
  });

  it('delegates to the host in the IDE even when window.Notification exists (CEF #2951)', async () => {
    // Recent JCEF exposes a present-but-broken Notification object; the runtime
    // marker must win so we never take the dead browser path inside the IDE.
    setIdeRuntime(true);
    installNotificationMock('granted');
    const { showNotificationBanner } = await import('../notify');
    await showNotificationBanner(NotificationKind.SESSION_COMPLETE, { sessionTitle: 'My Session' });
    expect(showNotificationMock).toHaveBeenCalledTimes(1);
    expect(constructorSpy).not.toHaveBeenCalled();
  });

  /**
   * The IDE opens the page with a `panelId` on the URL and drops it on the first
   * navigation, which is the moment the first session is created. While the host
   * was judged by that parameter, every later turn took the browser path inside
   * JCEF and tried to draw a `Notification` that does nothing there.
   */
  it('takes the IDE path with a URL that carries no panelId', async () => {
    setIdeRuntime(true);
    window.history.replaceState({}, '', '/sessions/abc?workingDir=/repo');
    installNotificationMock('granted');
    const { showNotificationBanner } = await import('../notify');
    await showNotificationBanner(NotificationKind.SESSION_COMPLETE, { sessionTitle: 'My Session' });
    expect(showNotificationMock).toHaveBeenCalledTimes(1);
    expect(constructorSpy).not.toHaveBeenCalled();
    window.history.replaceState({}, '', '/');
  });

  it('falls back to APP_NAME on the IDE path when sessionTitle is null', async () => {
    setIdeRuntime(true);
    uninstallNotificationMock();
    const { showNotificationBanner } = await import('../notify');
    await showNotificationBanner(NotificationKind.STREAM_ERROR, { sessionTitle: null });
    expect(showNotificationMock).toHaveBeenCalledWith({
      title: 'Claude Code',
      body: 'Response failed',
      clickActionTitle: 'Open session',
    });
  });

  it('never plays a sound of its own, on either path', async () => {
    installNotificationMock('granted');
    const { showNotificationBanner } = await import('../notify');
    await showNotificationBanner(NotificationKind.SESSION_COMPLETE, { sessionTitle: 't' });
    expect(constructorSpy).toHaveBeenCalledTimes(1);
    expect(playNotificationSoundMock).not.toHaveBeenCalled();

    setIdeRuntime(true);
    await showNotificationBanner(NotificationKind.SESSION_COMPLETE, { sessionTitle: 't' });
    // Twice now: both paths ask the backend, and neither rings anything.
    expect(showNotificationMock).toHaveBeenCalledTimes(2);
    expect(playNotificationSoundMock).not.toHaveBeenCalled();
  });

  /**
   * The browser asks too, and that is the change.
   *
   * It does not ask the backend to *draw* anything — only the page can draw a
   * browser notification. It asks whether the user wants one at all, because
   * that answer lives in the settings file and a page that kept its own copy
   * went on raising banners the user had switched off in the overlay above it.
   */
  it('asks the backend on the browser path too, then draws it here', async () => {
    installNotificationMock('granted');
    const { showNotificationBanner } = await import('../notify');
    await showNotificationBanner(NotificationKind.SESSION_COMPLETE, { sessionTitle: 't' });
    expect(showNotificationMock).toHaveBeenCalledTimes(1);
    expect(constructorSpy).toHaveBeenCalledTimes(1);
  });

  it('draws nothing in the browser when the backend says banners are off', async () => {
    installNotificationMock('granted');
    showNotificationMock.mockResolvedValue(false);
    const { showNotificationBanner } = await import('../notify');
    await showNotificationBanner(NotificationKind.SESSION_COMPLETE, { sessionTitle: 't' });
    expect(constructorSpy).not.toHaveBeenCalled();
  });

  it('draws nothing when the request to the backend fails', async () => {
    installNotificationMock('granted');
    showNotificationMock.mockRejectedValue(new Error('no backend'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { showNotificationBanner } = await import('../notify');
    await showNotificationBanner(NotificationKind.SESSION_COMPLETE, { sessionTitle: 't' });
    expect(constructorSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('is a no-op when permission is "default"', async () => {
    installNotificationMock('default');
    const { showNotificationBanner } = await import('../notify');
    await showNotificationBanner(NotificationKind.SESSION_COMPLETE, { sessionTitle: 't' });
    expect(constructorSpy).not.toHaveBeenCalled();
  });

  it('is a no-op when permission is "denied"', async () => {
    installNotificationMock('denied');
    const { showNotificationBanner } = await import('../notify');
    await showNotificationBanner(NotificationKind.SESSION_COMPLETE, { sessionTitle: 't' });
    expect(constructorSpy).not.toHaveBeenCalled();
  });

  it('creates a Notification with template title/body/icon when permission is granted', async () => {
    installNotificationMock('granted');
    const { showNotificationBanner } = await import('../notify');
    await showNotificationBanner(NotificationKind.SESSION_COMPLETE, { sessionTitle: 'My Session' });
    expect(constructorSpy).toHaveBeenCalledTimes(1);
    const [title, options] = constructorSpy.mock.calls[0];
    expect(title).toBe('My Session');
    expect(options).toMatchObject({
      body: 'Response complete',
      icon: '/favicon.svg',
    });
  });

  it('falls back to APP_NAME when sessionTitle is null', async () => {
    installNotificationMock('granted');
    const { showNotificationBanner } = await import('../notify');
    await showNotificationBanner(NotificationKind.SESSION_COMPLETE, { sessionTitle: null });
    expect(constructorSpy.mock.calls[0][0]).toBe('Claude Code');
  });

  it('always passes silent: true (sound is played separately by the backend)', async () => {
    installNotificationMock('granted');
    const { showNotificationBanner } = await import('../notify');
    await showNotificationBanner(NotificationKind.SESSION_COMPLETE, { sessionTitle: null });
    expect(constructorSpy.mock.calls[0][1]).toMatchObject({ silent: true });
  });

  it('focuses the window and closes the notification on click', async () => {
    installNotificationMock('granted');
    const { showNotificationBanner } = await import('../notify');
    await showNotificationBanner(NotificationKind.SESSION_COMPLETE, { sessionTitle: null });
    const n = createdInstances[0];
    expect(typeof n.onclick).toBe('function');
    n.onclick!();
    expect(focusSpy).toHaveBeenCalledTimes(1);
    expect(n.close).toHaveBeenCalledTimes(1);
  });

  it('removes the notification from the active set on close (re-emit allowed)', async () => {
    installNotificationMock('granted');
    const { showNotificationBanner } = await import('../notify');
    await showNotificationBanner(NotificationKind.SESSION_COMPLETE, { sessionTitle: null });
    const n = createdInstances[0];
    expect(typeof n.onclose).toBe('function');
    // Simulate close from OS
    n.onclose!();
    // Re-emit should produce a new instance without throwing
    await showNotificationBanner(NotificationKind.SESSION_COMPLETE, { sessionTitle: null });
    expect(createdInstances).toHaveLength(2);
  });

  it('closes all active notifications on beforeunload', async () => {
    installNotificationMock('granted');
    const { showNotificationBanner } = await import('../notify');
    await showNotificationBanner(NotificationKind.SESSION_COMPLETE, { sessionTitle: 'a' });
    await showNotificationBanner(NotificationKind.SESSION_COMPLETE, { sessionTitle: 'b' });
    expect(createdInstances).toHaveLength(2);
    expect(beforeUnloadListeners.length).toBeGreaterThanOrEqual(1);
    // Trigger the listeners
    beforeUnloadListeners.forEach((fn) => fn());
    createdInstances.forEach((n) => expect(n.close).toHaveBeenCalled());
  });
});
