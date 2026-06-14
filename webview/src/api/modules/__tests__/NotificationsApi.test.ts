import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotificationsApi } from '../NotificationsApi';
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
    // Reset the page URL so panelId isn't carried between tests.
    window.history.replaceState({}, '', '/');
  });

  it('sends SHOW_NOTIFICATION with title and body', async () => {
    const api = new NotificationsApi(bridge, () => ({} as ApiConfig));

    await api.show({ title: 'My session', body: 'Response complete' });

    expect(bridge.request).toHaveBeenCalledWith('SHOW_NOTIFICATION', {
      title: 'My session',
      body: 'Response complete',
    });
  });

  it('attaches the configured workingDir when present', async () => {
    const api = new NotificationsApi(bridge, () => ({ workingDir: '/repo' }));

    await api.show({ title: 'My session', body: 'Response complete' });

    expect(bridge.request).toHaveBeenCalledWith('SHOW_NOTIFICATION', {
      title: 'My session',
      body: 'Response complete',
      workingDir: '/repo',
    });
  });

  it('prefers an explicit workingDir over the configured one', async () => {
    const api = new NotificationsApi(bridge, () => ({ workingDir: '/repo' }));

    await api.show({ title: 't', body: 'b', workingDir: '/other' });

    expect(bridge.request).toHaveBeenCalledWith('SHOW_NOTIFICATION', {
      title: 't',
      body: 'b',
      workingDir: '/other',
    });
  });

  it('omits workingDir when neither explicit nor configured', async () => {
    const api = new NotificationsApi(bridge, () => ({} as ApiConfig));

    await api.show({ title: 't', body: 'b' });

    const [, payload] = vi.mocked(bridge.request).mock.calls[0];
    expect(payload).not.toHaveProperty('workingDir');
  });

  it('attaches the panelId from the page URL when present', async () => {
    window.history.replaceState({}, '', '/sessions/x?panelId=panel-123&workingDir=/repo');
    const api = new NotificationsApi(bridge, () => ({ workingDir: '/repo' }));

    await api.show({ title: 't', body: 'b' });

    expect(bridge.request).toHaveBeenCalledWith('SHOW_NOTIFICATION', {
      title: 't',
      body: 'b',
      workingDir: '/repo',
      panelId: 'panel-123',
    });
  });

  it('omits panelId when the URL has none', async () => {
    const api = new NotificationsApi(bridge, () => ({} as ApiConfig));

    await api.show({ title: 't', body: 'b' });

    const [, payload] = vi.mocked(bridge.request).mock.calls[0];
    expect(payload).not.toHaveProperty('panelId');
  });

  it('propagates backend errors', async () => {
    vi.mocked(bridge.request).mockRejectedValueOnce(new Error('No RPC client connected'));
    const api = new NotificationsApi(bridge, () => ({} as ApiConfig));

    await expect(api.show({ title: 't', body: 'b' })).rejects.toThrow('No RPC client connected');
  });
});
