import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../features/settings', () => ({
  readMergedSettings: vi.fn(),
  readSettingsFile: vi.fn(),
  readProjectSettings: vi.fn(),
}));
vi.mock('../../features/settings-watcher', () => ({
  getSettingsWatcher: vi.fn(() => undefined),
}));
vi.mock('../../../config/environment', () => ({
  ccgClientInfo: 'IntelliJ IDEA 2024.1.4 (IC-241.18034.62)',
}));

import { getSettingsHandler, parseIdeProductName } from '../getSettings';
import { readMergedSettings } from '../../features/settings';
import { MessageType, ClientEnv } from '../../../shared';
import type { ConnectionManager } from '../../../ws/connection-manager';
import type { Bridge } from '../../../bridge/bridge-interface';
import type { IPCMessage } from '../../types';

function createMockConnections() {
  return {
    sendTo: vi.fn(),
  } as unknown as ConnectionManager;
}

function createBridges(jetbrainsConnected: boolean | undefined): Record<ClientEnv, Bridge> {
  const jetbrains = jetbrainsConnected === undefined
    ? ({} as Bridge)
    : ({ isConnected: () => jetbrainsConnected } as unknown as Bridge);
  return {
    [ClientEnv.BROWSER]: {} as Bridge,
    [ClientEnv.JETBRAINS]: jetbrains,
  };
}

describe('getSettingsHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(readMergedSettings).mockResolvedValue({ settings: {}, overrides: [] });
  });

  it('acks with ideAttached=true and ideProduct parsed from ccgClientInfo when the JetBrains bridge is connected', async () => {
    const connections = createMockConnections();
    const bridges = createBridges(true);
    const message: IPCMessage = {
      type: MessageType.GET_SETTINGS,
      payload: {},
      timestamp: 0,
      requestId: 'req-1',
    };

    await getSettingsHandler('conn-1', message, connections, {} as Bridge, bridges);

    expect(connections.sendTo).toHaveBeenCalledWith(
      'conn-1',
      MessageType.ACK,
      expect.objectContaining({
        requestId: 'req-1',
        ideAttached: true,
        ideProduct: 'IntelliJ IDEA',
      }),
    );
  });

  it('acks with ideAttached=false when the JetBrains bridge is not connected', async () => {
    const connections = createMockConnections();
    const bridges = createBridges(false);
    const message: IPCMessage = {
      type: MessageType.GET_SETTINGS,
      payload: {},
      timestamp: 0,
      requestId: 'req-2',
    };

    await getSettingsHandler('conn-1', message, connections, {} as Bridge, bridges);

    expect(connections.sendTo).toHaveBeenCalledWith(
      'conn-1',
      MessageType.ACK,
      expect.objectContaining({ ideAttached: false }),
    );
  });

  it('acks with ideAttached=false when the bridge lacks isConnected (browser mode)', async () => {
    const connections = createMockConnections();
    const bridges = createBridges(undefined);
    const message: IPCMessage = {
      type: MessageType.GET_SETTINGS,
      payload: {},
      timestamp: 0,
      requestId: 'req-3',
    };

    await getSettingsHandler('conn-1', message, connections, {} as Bridge, bridges);

    expect(connections.sendTo).toHaveBeenCalledWith(
      'conn-1',
      MessageType.ACK,
      expect.objectContaining({ ideAttached: false }),
    );
  });
});

describe('parseIdeProductName', () => {
  it('extracts the product name from a version-and-build suffix', () => {
    expect(parseIdeProductName('WebStorm 2024.1.4 (WS-241.18034.62)')).toBe('WebStorm');
    expect(parseIdeProductName('IntelliJ IDEA 2024.1 (IC-241.14494.240)')).toBe('IntelliJ IDEA');
  });

  it('returns an empty string for empty input', () => {
    expect(parseIdeProductName('')).toBe('');
  });
});
