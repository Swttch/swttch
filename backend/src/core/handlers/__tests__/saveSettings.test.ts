import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../features/settings', () => ({
  saveSettingToScope: vi.fn(),
  readMergedSettings: vi.fn(),
}));
vi.mock('../../claude', () => ({
  Claude: { refresh: vi.fn() },
}));

import { saveSettingsHandler } from '../saveSettings';
import { saveSettingToScope, readMergedSettings } from '../../features/settings';
import { MessageType } from '../../../shared';
import type { ConnectionManager } from '../../../ws/connection-manager';
import type { Bridge } from '../../../bridge/bridge-interface';
import type { IPCMessage } from '../../types';

function createMockConnections() {
  return {
    sendTo: vi.fn(),
    broadcastToAll: vi.fn(),
  } as unknown as ConnectionManager;
}

/** A bridge stub that exposes the hostMode push, like JetBrainsBridge does. */
function createJetBrainsBridge() {
  return { pushHostModeForProject: vi.fn() } as unknown as Bridge & {
    pushHostModeForProject: (m: string, p?: string) => void;
  };
}

describe('saveSettingsHandler hostMode push', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(readMergedSettings).mockResolvedValue({ settings: {}, overrides: [] });
  });

  it('pushes the new hostMode to the IDE when hostMode is saved successfully', async () => {
    const connections = createMockConnections();
    const bridge = createJetBrainsBridge();
    vi.mocked(saveSettingToScope).mockResolvedValue({ status: 'ok' });

    const message: IPCMessage = {
      type: MessageType.SAVE_SETTINGS,
      payload: { key: 'hostMode', value: 'tool-window', scope: 'global' },
      timestamp: 0,
      requestId: 'req-1',
    };
    await saveSettingsHandler('conn-1', message, connections, bridge);

    expect(bridge.pushHostModeForProject).toHaveBeenCalledWith('tool-window', undefined);
  });

  // A project-scoped save must be addressed to that project's IDE windows only,
  // so the working directory is carried through to the push (issue #7).
  it('carries the project path when hostMode is saved at project scope', async () => {
    const connections = createMockConnections();
    const bridge = createJetBrainsBridge();
    vi.mocked(saveSettingToScope).mockResolvedValue({ status: 'ok' });

    const message: IPCMessage = {
      type: MessageType.SAVE_SETTINGS,
      payload: {
        key: 'hostMode',
        value: 'tool-window',
        scope: 'project',
        workingDir: '/home/u/proj',
      },
      timestamp: 0,
      requestId: 'req-5',
    };
    await saveSettingsHandler('conn-1', message, connections, bridge);

    expect(bridge.pushHostModeForProject).toHaveBeenCalledWith('tool-window', '/home/u/proj');
  });

  it('does not push when a non-hostMode setting is saved', async () => {
    const connections = createMockConnections();
    const bridge = createJetBrainsBridge();
    vi.mocked(saveSettingToScope).mockResolvedValue({ status: 'ok' });

    const message: IPCMessage = {
      type: MessageType.SAVE_SETTINGS,
      payload: { key: 'fontSize', value: 15, scope: 'global' },
      timestamp: 0,
      requestId: 'req-2',
    };
    await saveSettingsHandler('conn-1', message, connections, bridge);

    expect(bridge.pushHostModeForProject).not.toHaveBeenCalled();
  });

  it('does not push when the hostMode save fails', async () => {
    const connections = createMockConnections();
    const bridge = createJetBrainsBridge();
    vi.mocked(saveSettingToScope).mockResolvedValue({ status: 'error', error: 'disk full' });

    const message: IPCMessage = {
      type: MessageType.SAVE_SETTINGS,
      payload: { key: 'hostMode', value: 'tool-window', scope: 'global' },
      timestamp: 0,
      requestId: 'req-3',
    };
    await saveSettingsHandler('conn-1', message, connections, bridge);

    expect(bridge.pushHostModeForProject).not.toHaveBeenCalled();
  });

  it('is a no-op for a bridge without the hostMode push (browser mode)', async () => {
    const connections = createMockConnections();
    const browserBridge = {} as Bridge; // no pushHostModeForProject
    vi.mocked(saveSettingToScope).mockResolvedValue({ status: 'ok' });

    const message: IPCMessage = {
      type: MessageType.SAVE_SETTINGS,
      payload: { key: 'hostMode', value: 'tool-window', scope: 'global' },
      timestamp: 0,
      requestId: 'req-4',
    };
    // Must not throw even though the bridge lacks pushHostModeForProject.
    await expect(
      saveSettingsHandler('conn-1', message, connections, browserBridge),
    ).resolves.toBeUndefined();
  });
});
