import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Spread the real module: the handler also reads MAC_EXIT_NOT_AUTHORIZED from
// it, and a factory that lists only showOsNotification deletes every other
// export.
vi.mock('../../../system-notifications', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../system-notifications')>()),
  showOsNotification: vi.fn().mockResolvedValue(undefined),
  // Both real ones spawn the notifier and talk to macOS; neither belongs here.
  offerPersistentBannersAfterGrant: vi.fn().mockResolvedValue(undefined),
  awaitFirstPermissionAnswer: vi.fn().mockResolvedValue(true),
}));

vi.mock('../../features/settings', () => ({
  readMergedSettings: vi.fn(),
  saveSettingToFile: vi.fn().mockResolvedValue({ status: 'ok' }),
}));

import { showNotificationHandler } from '../showNotification';
import {
  awaitFirstPermissionAnswer,
  offerPersistentBannersAfterGrant,
  showOsNotification,
} from '../../../system-notifications';
import { readMergedSettings, saveSettingToFile } from '../../features/settings';
import type { ConnectionManager } from '../../../ws/connection-manager';
import type { Bridge } from '../../../bridge/bridge-interface';
import type { IPCMessage } from '../../types';

const mockOsNotify = vi.mocked(showOsNotification);
const mockReadMergedSettings = vi.mocked(readMergedSettings);
const mockSaveSetting = vi.mocked(saveSettingToFile);
const mockOfferPersistent = vi.mocked(offerPersistentBannersAfterGrant);
const mockAwaitAnswer = vi.mocked(awaitFirstPermissionAnswer);

const REAL_PLATFORM = process.platform;
function setPlatform(platform: NodeJS.Platform) {
  Object.defineProperty(process, 'platform', { value: platform, configurable: true });
}

/**
 * Drive the notifier's reported outcome back into the handler, the way the real
 * one does once the banner is finished with.
 */
/**
 * Let the permission poll finish.
 *
 * It is deliberately not awaited by the handler — the prompt waits for a person
 * while the banner is already on screen — so a test has to give its microtasks a
 * turn before asserting on what it wrote.
 */
async function flushPermissionPoll() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function replyWithOutcome(code: number | null) {
  mockOsNotify.mockImplementation(async (_options, onOutcome) => {
    onOutcome?.({ code, stdout: '' });
  });
}

/** Stands in for the plugin settings file the handler reads on every request. */
function settingsFileSays(settings: Record<string, unknown>) {
  mockReadMergedSettings.mockResolvedValue({ settings, overrides: [] });
}

function createMockConnections() {
  return {
    sendTo: vi.fn(),
    broadcastToAll: vi.fn(),
  } as unknown as ConnectionManager;
}

function createMockBridge(
  outcome: { shown: boolean; ideFocused: boolean; activateBundleId?: string } = {
    shown: true,
    ideFocused: true,
  },
) {
  return {
    showNotification: vi.fn().mockResolvedValue(outcome),
    focusSession: vi.fn().mockResolvedValue(undefined),
  } as unknown as Bridge;
}

describe('showNotificationHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Banners on is the shipped default; the tests that care set their own.
    settingsFileSays({ notificationBanner: true });
  });

  it('forwards title, body and workingDir to the bridge and acks ok', async () => {
    const connections = createMockConnections();
    const bridge = createMockBridge();
    const message: IPCMessage = {
      type: 'SHOW_NOTIFICATION',
      payload: { title: 'My session', body: 'Response complete', workingDir: '/repo' },
      timestamp: 0,
      requestId: 'req-1',
    };

    await showNotificationHandler('conn-1', message, connections, bridge);

    expect(bridge.showNotification).toHaveBeenCalledWith({
      title: 'My session',
      body: 'Response complete',
      workingDir: '/repo',
    });
    expect(connections.sendTo).toHaveBeenCalledWith('conn-1', 'ACK', {
      requestId: 'req-1',
      status: 'ok',
      allowed: true,
    });
  });

  it('defaults body to empty string and drops absent workingDir', async () => {
    const connections = createMockConnections();
    const bridge = createMockBridge();
    const message: IPCMessage = {
      type: 'SHOW_NOTIFICATION',
      payload: { title: 'My session' },
      timestamp: 0,
      requestId: 'req-2',
    };

    await showNotificationHandler('conn-1', message, connections, bridge);

    expect(bridge.showNotification).toHaveBeenCalledWith({
      title: 'My session',
      body: '',
      workingDir: undefined,
    });
    expect(connections.sendTo).toHaveBeenCalledWith('conn-1', 'ACK', {
      requestId: 'req-2',
      status: 'ok',
      allowed: true,
    });
  });

  /**
   * The banner switch is answered here, not on the screen that asks.
   *
   * It used to be a screen's to hold, read once from the settings context. The
   * settings overlay draws on top of the chat screen without unmounting it, so
   * a user who switched banners off while a session was open left that screen
   * holding "on" — the same shape of defect the sound name had.
   */
  it('raises nothing, and says so, when the user switched banners off', async () => {
    const connections = createMockConnections();
    const bridge = createMockBridge();
    settingsFileSays({ notificationBanner: false });
    const message: IPCMessage = {
      type: 'SHOW_NOTIFICATION',
      payload: { title: 'My session', body: 'Response complete' },
      timestamp: 0,
      requestId: 'req-off',
    };

    await showNotificationHandler('conn-1', message, connections, bridge);

    expect(bridge.showNotification).not.toHaveBeenCalled();
    expect(mockOsNotify).not.toHaveBeenCalled();
    expect(connections.sendTo).toHaveBeenCalledWith('conn-1', 'ACK', {
      requestId: 'req-off',
      status: 'ok',
      allowed: false,
    });
  });

  it('stops raising banners on the very next request after the switch goes off', async () => {
    const connections = createMockConnections();
    const bridge = createMockBridge();
    const message = (requestId: string): IPCMessage => ({
      type: 'SHOW_NOTIFICATION',
      payload: { title: 'My session', body: 'Response complete' },
      timestamp: 0,
      requestId,
    });

    settingsFileSays({ notificationBanner: true });
    await showNotificationHandler('conn-1', message('turn-1'), connections, bridge);
    expect(bridge.showNotification).toHaveBeenCalledTimes(1);

    // Switched off in the overlay; the screen underneath is untouched and keeps
    // the same connection.
    settingsFileSays({ notificationBanner: false });
    await showNotificationHandler('conn-1', message('turn-2'), connections, bridge);

    expect(bridge.showNotification).toHaveBeenCalledTimes(1);
  });

  it('treats a settings file written before the switch existed as banners on', async () => {
    const connections = createMockConnections();
    const bridge = createMockBridge();
    settingsFileSays({});
    const message: IPCMessage = {
      type: 'SHOW_NOTIFICATION',
      payload: { title: 'My session', body: 'Response complete' },
      timestamp: 0,
      requestId: 'req-legacy',
    };

    await showNotificationHandler('conn-1', message, connections, bridge);

    expect(bridge.showNotification).toHaveBeenCalledTimes(1);
    expect(connections.sendTo).toHaveBeenCalledWith('conn-1', 'ACK', {
      requestId: 'req-legacy',
      status: 'ok',
      allowed: true,
    });
  });

  it('rejects when title is missing', async () => {
    const connections = createMockConnections();
    const bridge = createMockBridge();
    const message: IPCMessage = {
      type: 'SHOW_NOTIFICATION',
      payload: { body: 'no title' },
      timestamp: 0,
      requestId: 'req-3',
    };

    await showNotificationHandler('conn-1', message, connections, bridge);

    expect(bridge.showNotification).not.toHaveBeenCalled();
    expect(connections.sendTo).toHaveBeenCalledWith('conn-1', 'ACK', {
      requestId: 'req-3',
      status: 'error',
      error: 'Missing or invalid title',
    });
  });

  it('surfaces the underlying error message when the bridge throws', async () => {
    const connections = createMockConnections();
    const bridge = createMockBridge();
    vi.mocked(bridge.showNotification).mockRejectedValue(new Error('No RPC client connected'));
    const message: IPCMessage = {
      type: 'SHOW_NOTIFICATION',
      payload: { title: 'My session', body: 'Response complete' },
      timestamp: 0,
      requestId: 'req-4',
    };

    await showNotificationHandler('conn-1', message, connections, bridge);

    expect(connections.sendTo).toHaveBeenCalledWith('conn-1', 'ACK', {
      requestId: 'req-4',
      status: 'error',
      error: 'No RPC client connected',
    });
  });

  it('raises an OS notification when the IDE balloon was shown but the IDE is NOT focused', async () => {
    const connections = createMockConnections();
    const bridge = createMockBridge({ shown: true, ideFocused: false });
    const message: IPCMessage = {
      type: 'SHOW_NOTIFICATION',
      payload: { title: 'My session', body: 'Response complete', panelId: 'panel-7' },
      timestamp: 0,
      requestId: 'req-5',
    };

    await showNotificationHandler('conn-1', message, connections, bridge);

    // panelId travels as groupId so a panel replaces its own previous banner.
    expect(mockOsNotify).toHaveBeenCalledWith(
      {
        title: 'My session',
        body: 'Response complete',
        groupId: 'panel-7',
        clickActionTitle: undefined,
        clickTimeoutSeconds: expect.any(Number),
      },
      expect.any(Function),
    );
    expect(connections.sendTo).toHaveBeenCalledWith('conn-1', 'ACK', {
      requestId: 'req-5',
      status: 'ok',
      allowed: true,
    });
  });

  /**
   * The button label is what keeps the notifier listening for a click, and it
   * has to be a word the user can read, so the webview sends it already
   * translated — the backend has no locale of its own to translate with.
   */
  it('passes the translated button label through to the notifier', async () => {
    const connections = createMockConnections();
    const bridge = createMockBridge({ shown: true, ideFocused: false });
    const message: IPCMessage = {
      type: 'SHOW_NOTIFICATION',
      payload: {
        title: 'My session',
        body: 'Response complete',
        panelId: 'panel-8',
        clickActionTitle: '세션 열기',
      },
      timestamp: 0,
      requestId: 'req-8',
    };

    await showNotificationHandler('conn-1', message, connections, bridge);

    expect(mockOsNotify).toHaveBeenCalledWith(
      expect.objectContaining({ groupId: 'panel-8', clickActionTitle: '세션 열기' }),
      expect.any(Function),
    );
  });

  /**
   * The click is the whole point of the notification: the user is somewhere
   * else, and tapping the banner has to bring back the session that called
   * them. The IDE raises itself because it is the only one that knows which
   * window and which tab — see the Bridge's focusSession.
   */
  it('asks the host to come forward when the banner is clicked', async () => {
    const connections = createMockConnections();
    const bridge = createMockBridge({ shown: true, ideFocused: false });
    mockOsNotify.mockImplementation(async (_options, onOutcome) => {
      onOutcome?.({ code: 0, stdout: '@ACTIONCLICKED' });
    });
    const message: IPCMessage = {
      type: 'SHOW_NOTIFICATION',
      payload: { title: 'My session', body: 'Response complete', panelId: 'panel-9' },
      timestamp: 0,
      requestId: 'req-9',
    };

    await showNotificationHandler('conn-1', message, connections, bridge);

    expect(bridge.focusSession).toHaveBeenCalledWith({ panelId: 'panel-9' });
  });

  /**
   * The same click, reported the Windows way.
   *
   * ntfytoast says nothing on stdout that macOS would recognise: pressing the
   * button exits 4 and prints the button's own label. Reading that with the
   * macOS dictionary — "anything that is not @CLOSED or @TIMEOUT" — would work
   * by accident here, which is why the platform is set explicitly: the branch
   * that has to answer is the win32 one, and it answers by exit code alone.
   */
  it('asks the host to come forward when the Windows toast button is pressed', async () => {
    setPlatform('win32');
    try {
      const connections = createMockConnections();
      const bridge = createMockBridge({ shown: true, ideFocused: false });
      mockOsNotify.mockImplementation(async (_options, onOutcome) => {
        onOutcome?.({ code: 4, stdout: 'Open session' });
      });
      const message: IPCMessage = {
        type: 'SHOW_NOTIFICATION',
        payload: { title: 'My session', body: 'Response complete', panelId: 'panel-win' },
        timestamp: 0,
        requestId: 'req-win-click',
      };

      await showNotificationHandler('conn-1', message, connections, bridge);

      expect(bridge.focusSession).toHaveBeenCalledWith({ panelId: 'panel-win' });
    } finally {
      setPlatform(REAL_PLATFORM);
    }
  });

  // Turning away from a banner is a decision too. Pulling the IDE in front of
  // whatever they turned to instead would be the opposite of helpful.
  it('leaves the user alone when the banner was dismissed', async () => {
    const connections = createMockConnections();
    const bridge = createMockBridge({ shown: true, ideFocused: false });
    mockOsNotify.mockImplementation(async (_options, onOutcome) => {
      onOutcome?.({ code: 0, stdout: '@CLOSED' });
    });
    const message: IPCMessage = {
      type: 'SHOW_NOTIFICATION',
      payload: { title: 'My session', body: 'Response complete', panelId: 'panel-9' },
      timestamp: 0,
      requestId: 'req-10',
    };

    await showNotificationHandler('conn-1', message, connections, bridge);

    expect(bridge.focusSession).not.toHaveBeenCalled();
  });

  it('does NOT raise an OS notification when the IDE is focused', async () => {
    const connections = createMockConnections();
    const bridge = createMockBridge({ shown: true, ideFocused: true });
    const message: IPCMessage = {
      type: 'SHOW_NOTIFICATION',
      payload: { title: 'My session', body: 'Response complete' },
      timestamp: 0,
      requestId: 'req-6',
    };

    await showNotificationHandler('conn-1', message, connections, bridge);

    expect(mockOsNotify).not.toHaveBeenCalled();
  });

  it('does NOT raise an OS notification when the balloon was suppressed (user viewing session)', async () => {
    const connections = createMockConnections();
    const bridge = createMockBridge({ shown: false, ideFocused: false });
    const message: IPCMessage = {
      type: 'SHOW_NOTIFICATION',
      payload: { title: 'My session', body: 'Response complete' },
      timestamp: 0,
      requestId: 'req-7',
    };

    await showNotificationHandler('conn-1', message, connections, bridge);

    expect(mockOsNotify).not.toHaveBeenCalled();
  });
});

/**
 * The first notification is the permission prompt.
 *
 * Raising a banner from a bundle macOS has never approved is what makes it ask,
 * so the notifier's exit code carries the user's answer and nothing else does.
 * Recording it turns an OS-level decision into our own switch — which is what
 * lets the settings screen show the user their own choice instead of a default
 * we invented, and what stops us asking again on every single turn.
 */
describe('showNotificationHandler – the first notification asks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSaveSetting.mockResolvedValue({ status: 'ok' });
    mockOsNotify.mockResolvedValue(undefined);
    mockAwaitAnswer.mockResolvedValue(true);
    mockOfferPersistent.mockResolvedValue(undefined);
  });

  afterEach(() => {
    setPlatform(REAL_PLATFORM);
  });

  function unseenUser(): IPCMessage {
    settingsFileSays({ notificationBanner: null });
    return {
      type: 'SHOW_NOTIFICATION',
      payload: { title: 'My session', body: 'Response complete' },
      timestamp: 0,
      requestId: 'req-first',
    };
  }

  it('writes the switch ON when the user granted permission', async () => {
    setPlatform('darwin');
    const connections = createMockConnections();
    const bridge = createMockBridge({ shown: true, ideFocused: false });
    mockAwaitAnswer.mockResolvedValue(true);

    await showNotificationHandler('conn-1', unseenUser(), connections, bridge);
    await flushPermissionPoll();

    expect(mockSaveSetting).toHaveBeenCalledWith('notificationBanner', true);
  });

  /**
   * The prompt waits for a person, who may never come back to it. Writing an
   * answer they did not give would settle the question permanently — and they
   * would never be asked again.
   */
  it('writes nothing when the prompt went unanswered', async () => {
    setPlatform('darwin');
    const connections = createMockConnections();
    const bridge = createMockBridge({ shown: true, ideFocused: false });
    mockAwaitAnswer.mockResolvedValue(null);

    await showNotificationHandler('conn-1', unseenUser(), connections, bridge);
    await flushPermissionPoll();

    expect(mockSaveSetting).not.toHaveBeenCalled();
    expect(mockOfferPersistent).not.toHaveBeenCalled();
  });

  /**
   * The one the disablement check is for: exit 3 is macOS reporting that the
   * user pressed "Don't Allow". Reading it as anything else would leave the
   * switch on, and every later turn would go on asking an OS that has already
   * said no.
   */
  it('writes the switch OFF when the user refused permission', async () => {
    setPlatform('darwin');
    const connections = createMockConnections();
    const bridge = createMockBridge({ shown: true, ideFocused: false });
    mockAwaitAnswer.mockResolvedValue(false);

    await showNotificationHandler('conn-1', unseenUser(), connections, bridge);
    await flushPermissionPoll();

    expect(mockSaveSetting).toHaveBeenCalledWith('notificationBanner', false);
  });

  // Windows and Linux have no permission prompt at all, and 3 means something
  // entirely different to their notifier — "timed out". Reading it with the
  // macOS dictionary would switch banners off for a user who never refused.
  // Windows and Linux have no permission prompt at all, so the first
  // notification simply confirms banners work and the switch lands on.
  it('switches banners on without a prompt off macOS', async () => {
    setPlatform('win32');
    const connections = createMockConnections();
    const bridge = createMockBridge({ shown: true, ideFocused: false });

    await showNotificationHandler('conn-1', unseenUser(), connections, bridge);
    await flushPermissionPoll();

    expect(mockAwaitAnswer).not.toHaveBeenCalled();
    expect(mockSaveSetting).toHaveBeenCalledWith('notificationBanner', true);
  });

  it('leaves the question open when no banner reached the OS', async () => {
    setPlatform('darwin');
    const connections = createMockConnections();
    // The user is looking straight at the session, so the host suppressed it —
    // there was no prompt, and nothing to record.
    const bridge = createMockBridge({ shown: false, ideFocused: true });

    await showNotificationHandler('conn-1', unseenUser(), connections, bridge);

    expect(mockSaveSetting).not.toHaveBeenCalled();
  });

  it('does not re-ask once the user has answered', async () => {
    setPlatform('darwin');
    const connections = createMockConnections();
    const bridge = createMockBridge({ shown: true, ideFocused: false });
    mockAwaitAnswer.mockResolvedValue(true);
    settingsFileSays({ notificationBanner: true });

    await showNotificationHandler(
      'conn-1',
      {
        type: 'SHOW_NOTIFICATION',
        payload: { title: 'My session', body: 'Response complete' },
        timestamp: 0,
        requestId: 'req-again',
      },
      connections,
      bridge,
    );

    expect(mockSaveSetting).not.toHaveBeenCalled();
  });

  /**
   * The moment permission is granted is the one moment the banner-style choice
   * is in front of the user: they have just said they want these notifications,
   * and macOS has just defaulted them to the style that fades after a few
   * seconds — the wrong one for a notification meant to reach someone who walked
   * away.
   */
  it('offers the persistent-banner switch right after permission is granted', async () => {
    setPlatform('darwin');
    const connections = createMockConnections();
    const bridge = createMockBridge({ shown: true, ideFocused: false });
    mockAwaitAnswer.mockResolvedValue(true);

    await showNotificationHandler('conn-1', unseenUser(), connections, bridge);
    await flushPermissionPoll();

    expect(mockOfferPersistent).toHaveBeenCalledTimes(1);
  });

  // Nothing to offer someone who said no: there are no banners to keep on screen.
  it('does not open System Settings when the user refused', async () => {
    setPlatform('darwin');
    const connections = createMockConnections();
    const bridge = createMockBridge({ shown: true, ideFocused: false });
    mockAwaitAnswer.mockResolvedValue(false);

    await showNotificationHandler('conn-1', unseenUser(), connections, bridge);
    await flushPermissionPoll();

    expect(mockOfferPersistent).not.toHaveBeenCalled();
  });

  // Only on the first answer. Doing it on every notification would open System
  // Settings over and over for someone who simply likes the fading style.
  it('does not offer again once the user has answered before', async () => {
    setPlatform('darwin');
    const connections = createMockConnections();
    const bridge = createMockBridge({ shown: true, ideFocused: false });
    mockAwaitAnswer.mockResolvedValue(true);
    settingsFileSays({ notificationBanner: true });

    await showNotificationHandler(
      'conn-1',
      {
        type: 'SHOW_NOTIFICATION',
        payload: { title: 'My session', body: 'Response complete' },
        timestamp: 0,
        requestId: 'req-repeat',
      },
      connections,
      bridge,
    );
    await flushPermissionPoll();

    expect(mockOfferPersistent).not.toHaveBeenCalled();
  });
});
