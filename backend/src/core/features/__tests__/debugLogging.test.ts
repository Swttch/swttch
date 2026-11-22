import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../settings', () => ({
  readMergedSettings: vi.fn(),
  readSettingsFile: vi.fn(),
  saveSettingToScope: vi.fn(),
}));

import {
  setBackendDebugFloor,
  isBackendDebugOn,
  applyDebugLogging,
  reconcileDebugLogging,
  reconcileOnPanelOpen,
  onHostDebugLoggingChanged,
  _resetPanelOpenThrottle,
} from '../debugLogging';
import { readMergedSettings, readSettingsFile, saveSettingToScope } from '../settings';
import { LOG_LEVEL_ENV } from '../../../logging/log-level';
import { MessageType } from '../../../shared';
import type { Bridge } from '../../../bridge/bridge-interface';
import type { ConnectionManager } from '../../../ws/connection-manager';

function createBridge(hostEnabled: boolean | Error) {
  return {
    getDebugLogging: vi.fn(async () => {
      if (hostEnabled instanceof Error) throw hostEnabled;
      return hostEnabled;
    }),
    setDebugLogging: vi.fn(async () => undefined),
  } as unknown as Bridge & {
    getDebugLogging: ReturnType<typeof vi.fn>;
    setDebugLogging: ReturnType<typeof vi.fn>;
  };
}

function createConnections() {
  return { broadcastToAll: vi.fn() } as unknown as ConnectionManager & {
    broadcastToAll: ReturnType<typeof vi.fn>;
  };
}

describe('debugLogging', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env[LOG_LEVEL_ENV];
    _resetPanelOpenThrottle();
    vi.mocked(saveSettingToScope).mockResolvedValue({ status: 'ok' });
    vi.mocked(readMergedSettings).mockResolvedValue({ settings: { debugMode: true }, overrides: [] });
  });

  afterEach(() => {
    delete process.env[LOG_LEVEL_ENV];
  });

  describe('the backend floor', () => {
    it('records DEBUG lines once turned on, and stops when turned off', () => {
      expect(isBackendDebugOn()).toBe(false);
      setBackendDebugFloor(true);
      expect(isBackendDebugOn()).toBe(true);
      setBackendDebugFloor(false);
      expect(isBackendDebugOn()).toBe(false);
    });
  });

  describe('applyDebugLogging', () => {
    it('sets the backend floor and the host switch together', async () => {
      const bridge = createBridge(false);
      await applyDebugLogging(true, bridge);
      expect(isBackendDebugOn()).toBe(true);
      expect(bridge.setDebugLogging).toHaveBeenCalledWith(true);
    });

    it('still takes effect in the backend when the host does not answer', async () => {
      const bridge = createBridge(false);
      bridge.setDebugLogging.mockRejectedValue(new Error('IDE not attached'));
      await applyDebugLogging(true, bridge);
      expect(isBackendDebugOn()).toBe(true);
    });
  });

  describe('reconcileDebugLogging', () => {
    it('leaves a setting and a host that already agree alone', async () => {
      const bridge = createBridge(true);
      const save = vi.fn(async () => undefined);
      expect(await reconcileDebugLogging(bridge, true, save)).toBe('in-sync');
      expect(save).not.toHaveBeenCalled();
      expect(bridge.setDebugLogging).not.toHaveBeenCalled();
    });

    // The user turned it on in the IDE's Debug Log Settings: the toggle must show it.
    it('adopts the host when the host is on and the setting is off', async () => {
      const bridge = createBridge(true);
      const save = vi.fn(async () => undefined);
      expect(await reconcileDebugLogging(bridge, false, save)).toBe('adopted-host');
      expect(save).toHaveBeenCalledWith(true);
      expect(isBackendDebugOn()).toBe(true);
    });

    // After an IDE restart the host forgot a switch the user had saved.
    it('pushes the saved setting to the host when the host is off and the setting is on', async () => {
      const bridge = createBridge(false);
      const save = vi.fn(async () => undefined);
      expect(await reconcileDebugLogging(bridge, true, save)).toBe('pushed-setting');
      expect(bridge.setDebugLogging).toHaveBeenCalledWith(true);
      expect(save).not.toHaveBeenCalled();
    });

    it('reports an unreachable host without changing anything', async () => {
      const bridge = createBridge(new Error('not connected'));
      const save = vi.fn(async () => undefined);
      expect(await reconcileDebugLogging(bridge, true, save)).toBe('host-unreachable');
      expect(save).not.toHaveBeenCalled();
      expect(bridge.setDebugLogging).not.toHaveBeenCalled();
    });
  });

  describe('reconcileOnPanelOpen', () => {
    beforeEach(() => {
      vi.mocked(readSettingsFile).mockResolvedValue({ debugMode: false });
    });

    it('saves what the host turned on and tells every open page', async () => {
      const bridge = createBridge(true);
      const connections = createConnections();
      await reconcileOnPanelOpen(bridge, connections);
      expect(saveSettingToScope).toHaveBeenCalledWith('debugMode', true, 'global');
      expect(connections.broadcastToAll).toHaveBeenCalledWith(MessageType.SETTINGS_CHANGED, {
        settings: { debugMode: true },
        overrides: [],
      });
    });

    it('asks the host once for panels that open together', async () => {
      const bridge = createBridge(false);
      const connections = createConnections();
      await reconcileOnPanelOpen(bridge, connections);
      await reconcileOnPanelOpen(bridge, connections);
      expect(bridge.getDebugLogging).toHaveBeenCalledTimes(1);
    });

    it('asks again at the next panel when the host did not answer', async () => {
      const bridge = createBridge(new Error('not connected'));
      const connections = createConnections();
      await reconcileOnPanelOpen(bridge, connections);
      await reconcileOnPanelOpen(bridge, connections);
      expect(bridge.getDebugLogging).toHaveBeenCalledTimes(2);
    });

    it('never lets a failure reach the caller that is opening the panel', async () => {
      vi.mocked(readSettingsFile).mockRejectedValue(new Error('disk'));
      const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      await expect(reconcileOnPanelOpen(createBridge(true), createConnections())).resolves.toBeUndefined();
      errors.mockRestore();
    });
  });

  describe('onHostDebugLoggingChanged', () => {
    it('saves the host switch as the setting and broadcasts it', async () => {
      const connections = createConnections();
      await onHostDebugLoggingChanged(true, connections);
      expect(isBackendDebugOn()).toBe(true);
      expect(saveSettingToScope).toHaveBeenCalledWith('debugMode', true, 'global');
      expect(connections.broadcastToAll).toHaveBeenCalledWith(MessageType.SETTINGS_CHANGED, expect.anything());
    });
  });
});
