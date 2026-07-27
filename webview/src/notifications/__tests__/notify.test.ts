import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NotificationKind, SOUND_OFF } from '../types';

// ---------------------------------------------------------------------------
// api.sounds mocking
//
// notify.ts imports `{ api }` from '@/api/ClaudeCodeApi'. We swap a vi.fn
// in for `api.sounds.play` so we can assert call counts/payloads without
// reaching across the bridge.
// ---------------------------------------------------------------------------

const playMock = vi.fn();

vi.mock('@/api/ClaudeCodeApi', () => ({
  api: {
    sounds: {
      play: (...args: unknown[]) => playMock(...args),
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

beforeEach(() => {
  vi.resetModules();
  playMock.mockReset();
  playMock.mockResolvedValue(undefined);
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
});

afterEach(() => {
  vi.restoreAllMocks();
  uninstallNotificationMock();
  window.focus = originalFocus;
});

describe('notify()', () => {
  it('is a no-op when window.Notification is unavailable', async () => {
    uninstallNotificationMock();
    const { notify } = await import('../notify');
    expect(() =>
      notify(NotificationKind.SESSION_COMPLETE, { sessionTitle: 't' }, SOUND_OFF),
    ).not.toThrow();
    expect(playMock).not.toHaveBeenCalled();
  });

  it('is a no-op when permission is "default"', async () => {
    installNotificationMock('default');
    const { notify } = await import('../notify');
    notify(NotificationKind.SESSION_COMPLETE, { sessionTitle: 't' }, 'Glass');
    expect(constructorSpy).not.toHaveBeenCalled();
    expect(playMock).not.toHaveBeenCalled();
  });

  it('is a no-op when permission is "denied"', async () => {
    installNotificationMock('denied');
    const { notify } = await import('../notify');
    notify(NotificationKind.SESSION_COMPLETE, { sessionTitle: 't' }, 'Glass');
    expect(constructorSpy).not.toHaveBeenCalled();
    expect(playMock).not.toHaveBeenCalled();
  });

  it('creates a Notification with template title/body/icon when permission is granted', async () => {
    installNotificationMock('granted');
    const { notify } = await import('../notify');
    notify(
      NotificationKind.SESSION_COMPLETE,
      { sessionTitle: 'My Session' },
      SOUND_OFF,
    );
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
    const { notify } = await import('../notify');
    notify(NotificationKind.SESSION_COMPLETE, { sessionTitle: null }, SOUND_OFF);
    expect(constructorSpy.mock.calls[0][0]).toBe('Claude Code');
  });

  it('always passes silent: true (sound is delegated to the backend)', async () => {
    installNotificationMock('granted');
    const { notify } = await import('../notify');
    notify(NotificationKind.SESSION_COMPLETE, { sessionTitle: null }, 'Glass');
    expect(constructorSpy.mock.calls[0][1]).toMatchObject({ silent: true });
  });

  it('passes silent: true even when soundSelection is SOUND_OFF', async () => {
    installNotificationMock('granted');
    const { notify } = await import('../notify');
    notify(NotificationKind.SESSION_COMPLETE, { sessionTitle: null }, SOUND_OFF);
    expect(constructorSpy.mock.calls[0][1]).toMatchObject({ silent: true });
  });

  it('does NOT call api.sounds.play when soundSelection is SOUND_OFF', async () => {
    installNotificationMock('granted');
    const { notify } = await import('../notify');
    notify(NotificationKind.SESSION_COMPLETE, { sessionTitle: null }, SOUND_OFF);
    expect(playMock).not.toHaveBeenCalled();
  });

  it('calls api.sounds.play(soundId) when soundSelection is a backend id', async () => {
    installNotificationMock('granted');
    const { notify } = await import('../notify');
    notify(NotificationKind.SESSION_COMPLETE, { sessionTitle: null }, 'Glass');
    expect(playMock).toHaveBeenCalledTimes(1);
    expect(playMock).toHaveBeenCalledWith('Glass');
  });

  it('does not propagate failures from api.sounds.play to the caller', async () => {
    installNotificationMock('granted');
    playMock.mockRejectedValueOnce(new Error('spawn failed'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { notify } = await import('../notify');

    expect(() =>
      notify(NotificationKind.SESSION_COMPLETE, { sessionTitle: null }, 'Glass'),
    ).not.toThrow();

    // Allow the microtask attached to the play() promise to run.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('focuses the window and closes the notification on click', async () => {
    installNotificationMock('granted');
    const { notify } = await import('../notify');
    notify(NotificationKind.SESSION_COMPLETE, { sessionTitle: null }, SOUND_OFF);
    const n = createdInstances[0];
    expect(typeof n.onclick).toBe('function');
    n.onclick!();
    expect(focusSpy).toHaveBeenCalledTimes(1);
    expect(n.close).toHaveBeenCalledTimes(1);
  });

  it('removes the notification from the active set on close (re-emit allowed)', async () => {
    installNotificationMock('granted');
    const { notify } = await import('../notify');
    notify(NotificationKind.SESSION_COMPLETE, { sessionTitle: null }, SOUND_OFF);
    const n = createdInstances[0];
    expect(typeof n.onclose).toBe('function');
    // Simulate close from OS
    n.onclose!();
    // Re-emit should produce a new instance without throwing
    notify(NotificationKind.SESSION_COMPLETE, { sessionTitle: null }, SOUND_OFF);
    expect(createdInstances).toHaveLength(2);
  });

  it('closes all active notifications on beforeunload', async () => {
    installNotificationMock('granted');
    const { notify } = await import('../notify');
    notify(NotificationKind.SESSION_COMPLETE, { sessionTitle: 'a' }, SOUND_OFF);
    notify(NotificationKind.SESSION_COMPLETE, { sessionTitle: 'b' }, SOUND_OFF);
    expect(createdInstances).toHaveLength(2);
    expect(beforeUnloadListeners.length).toBeGreaterThanOrEqual(1);
    // Trigger the listeners
    beforeUnloadListeners.forEach((fn) => fn());
    createdInstances.forEach((n) => expect(n.close).toHaveBeenCalled());
  });
});
