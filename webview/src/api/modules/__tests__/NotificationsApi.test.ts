import { describe, it, expect, vi, beforeEach } from 'vitest';

// Which environment the page is running in decides where the panel id comes
// from, so it is mocked per test rather than left to jsdom.
const isJetBrainsMock = vi.hoisted(() => vi.fn(() => false));
vi.mock('../../../config/environment', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../config/environment')>()),
  isJetBrains: isJetBrainsMock,
}));

import { NotificationsApi } from '../NotificationsApi';
import { resolvePanelId, _resetPanelIdCache } from '../../bridge/resolvePanelId';
import type { BridgeClient } from '../../bridge/BridgeClient';
import type { ApiConfig } from '../../ClaudeCodeApi';

function createMockBridge() {
  return {
    request: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn().mockReturnValue(vi.fn()),
  } as unknown as BridgeClient;
}

describe('NotificationsApi', () => {
  let bridge: ReturnType<typeof createMockBridge>;

  beforeEach(() => {
    bridge = createMockBridge();
    isJetBrainsMock.mockReturnValue(false);
    // A fresh page load: no id resolved yet, and no leftover query string.
    _resetPanelIdCache();
    window.history.replaceState({}, '', '/');
  });

  /**
   * Every banner request names the panel it belongs to, so a test about
   * something else still has to say which panel that is. Asking the resolver is
   * the assertion: the contract is that the request carries the SAME id the
   * WebSocket connection was opened with, which is the one the resolver answers.
   */
  function thisPanelId(): string {
    return resolvePanelId();
  }

  it('sends SHOW_NOTIFICATION with title, body and the panel it belongs to', async () => {
    const api = new NotificationsApi(bridge, () => ({} as ApiConfig));

    await api.show({ title: 'My session', body: 'Response complete' });

    expect(bridge.request).toHaveBeenCalledWith('SHOW_NOTIFICATION', {
      title: 'My session',
      body: 'Response complete',
      panelId: thisPanelId(),
    });
  });

  it('attaches the configured workingDir when present', async () => {
    const api = new NotificationsApi(bridge, () => ({ workingDir: '/repo' }));

    await api.show({ title: 'My session', body: 'Response complete' });

    expect(bridge.request).toHaveBeenCalledWith('SHOW_NOTIFICATION', {
      title: 'My session',
      body: 'Response complete',
      workingDir: '/repo',
      panelId: thisPanelId(),
    });
  });

  it('prefers an explicit workingDir over the configured one', async () => {
    const api = new NotificationsApi(bridge, () => ({ workingDir: '/repo' }));

    await api.show({ title: 't', body: 'b', workingDir: '/other' });

    expect(bridge.request).toHaveBeenCalledWith('SHOW_NOTIFICATION', {
      title: 't',
      body: 'b',
      workingDir: '/other',
      panelId: thisPanelId(),
    });
  });

  it('omits workingDir when neither explicit nor configured', async () => {
    const api = new NotificationsApi(bridge, () => ({} as ApiConfig));

    await api.show({ title: 't', body: 'b' });

    const [, payload] = vi.mocked(bridge.request).mock.calls[0];
    expect(payload).not.toHaveProperty('workingDir');
  });

  it('attaches the panel id the IDE embedded in the page URL', async () => {
    isJetBrainsMock.mockReturnValue(true);
    window.history.replaceState({}, '', '/sessions/new?panelId=panel-123&workingDir=/repo');
    const api = new NotificationsApi(bridge, () => ({ workingDir: '/repo' }));

    await api.show({ title: 't', body: 'b' });

    expect(bridge.request).toHaveBeenCalledWith('SHOW_NOTIFICATION', {
      title: 't',
      body: 'b',
      workingDir: '/repo',
      panelId: 'panel-123',
    });
  });

  /**
   * The defect this file exists to keep out, measured on Windows 11: every
   * banner the IDE raised was logged as `panelId=none`, so the host was never
   * told which tab to return to and the notifier was never given a group to
   * replace.
   *
   * The id was read off the page URL at the moment the banner went out. The IDE
   * opens the page at `/sessions/new?…&panelId=…`, the first message creates a
   * session, and `navigateToSession` rebuilds the URL out of `workingDir` and
   * `rootDir` alone — so from the first turn onwards there was nothing to read.
   * Every notification a user ever sees comes after that point.
   */
  it('keeps naming the panel after the first message has rewritten the URL', async () => {
    isJetBrainsMock.mockReturnValue(true);
    window.history.replaceState({}, '', '/sessions/new?panelId=panel-123&workingDir=/repo');
    // The WebSocket is opened before any in-app navigation, and that is when the
    // id is taken; the backend indexes this panel's connection under it.
    expect(resolvePanelId()).toBe('panel-123');

    // The first message creates a session and the URL loses the panel id.
    window.history.replaceState({}, '', '/sessions/abc?workingDir=/repo');
    const api = new NotificationsApi(bridge, () => ({ workingDir: '/repo' }));

    await api.show({ title: 't', body: 'b' });

    expect(bridge.request).toHaveBeenCalledWith('SHOW_NOTIFICATION', {
      title: 't',
      body: 'b',
      workingDir: '/repo',
      panelId: 'panel-123',
    });
  });

  // In the browser the banner is drawn by the page itself, but the request still
  // names a panel: the backend groups by it, and a tab that notifies twice must
  // replace its own banner rather than stack a second one.
  it('names this tab in the browser too, with the id it connected under', async () => {
    const connectedAs = resolvePanelId();
    const api = new NotificationsApi(bridge, () => ({} as ApiConfig));

    await api.show({ title: 't', body: 'b' });

    expect(bridge.request).toHaveBeenCalledWith('SHOW_NOTIFICATION', {
      title: 't',
      body: 'b',
      panelId: connectedAs,
    });
  });

  it('lets a caller name a different panel', async () => {
    const api = new NotificationsApi(bridge, () => ({} as ApiConfig));

    await api.show({ title: 't', body: 'b', panelId: 'panel-elsewhere' });

    expect(bridge.request).toHaveBeenCalledWith('SHOW_NOTIFICATION', {
      title: 't',
      body: 'b',
      panelId: 'panel-elsewhere',
    });
  });

  it('propagates backend errors', async () => {
    vi.mocked(bridge.request).mockRejectedValueOnce(new Error('No RPC client connected'));
    const api = new NotificationsApi(bridge, () => ({} as ApiConfig));

    await expect(api.show({ title: 't', body: 'b' })).rejects.toThrow('No RPC client connected');
  });
});
