import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock BEFORE imports
vi.mock('../../claude', () => ({
  Claude: {
    execAuthed: vi.fn(),
    applyConfigDir: vi.fn(),
  },
}));

vi.mock('../../features/account-store', () => ({
  readRegistry: vi.fn(),
}));

vi.mock('../getUsage', () => ({
  runCcbUsage: vi.fn(),
  classifyError: vi.fn().mockReturnValue({ kind: 'unknown', message: 'Test error' }),
}));

import { getAllUsageHandler } from '../getAllUsage';
import { Claude } from '../../claude';
import { readRegistry } from '../../features/account-store';
import { runCcbUsage } from '../getUsage';
import type { ConnectionManager } from '../../../ws/connection-manager';
import type { Bridge } from '../../../bridge/bridge-interface';
import type { IPCMessage } from '../../types';
import { MessageType } from '../../../shared';

const mockExec = vi.mocked(Claude.execAuthed);
const mockReadRegistry = vi.mocked(readRegistry);
const mockRunCcbUsage = vi.mocked(runCcbUsage);

function createMockConnections() {
  return {
    sendTo: vi.fn(),
  } as unknown as ConnectionManager;
}

const mockBridge = {} as Bridge;

describe('getAllUsageHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns active account usage via ccb and inactive account usage from registry cache', async () => {
    const connections = createMockConnections();
    const message: IPCMessage = {
      type: MessageType.GET_ALL_USAGE,
      payload: { force: true },
      timestamp: 0,
      requestId: 'req-all-usage',
    };

    // Active email from claude auth status
    mockExec.mockResolvedValue({
      stdout: JSON.stringify({ email: 'active@example.com' }),
      stderr: '',
    });

    // Inactive account has a cached usage entry from when it was last active
    mockReadRegistry.mockResolvedValue({
      current: 'acc-active',
      accounts: {
        'acc-active': {
          id: 'acc-active',
          emailAddress: 'active@example.com',
          displayName: 'Active User',
          organizationName: null,
          subscriptionType: null,
          authMethod: null,
          createdAt: 0,
          updatedAt: 0,
          usageCached: null,
          usageCachedAt: 0,
        },
        'acc-inactive': {
          id: 'acc-inactive',
          emailAddress: 'inactive@example.com',
          displayName: 'Inactive User',
          organizationName: null,
          subscriptionType: null,
          authMethod: null,
          createdAt: 0,
          updatedAt: 0,
          usageCached: {
            five_hour: { utilization: 0.8, resets_at: '2026-06-29T21:30:41Z' },
            seven_day: null,
            seven_day_sonnet: null,
            seven_day_opus: null,
          },
          usageCachedAt: 1000,
        },
      },
      accountPools: [],
      accountOrder: [],
    });

    mockRunCcbUsage.mockResolvedValue({
      five_hour: { utilization: 0.2, resets_at: '2026-06-29T21:30:41Z' },
      seven_day: null,
      seven_day_oauth_apps: null,
      seven_day_sonnet: null,
      seven_day_opus: null,
      seven_day_cowork: null,
      iguana_necktie: null,
      extra_usage: null,
    });

    await getAllUsageHandler('conn-1', message, connections, mockBridge);

    expect(connections.sendTo).toHaveBeenCalledWith(
      'conn-1',
      MessageType.ACK,
      expect.objectContaining({
        requestId: 'req-all-usage',
        status: 'ok',
        accounts: [
          expect.objectContaining({
            id: 'acc-active',
            emailAddress: 'active@example.com',
            active: true,
            usage: expect.objectContaining({
              five_hour: expect.objectContaining({ utilization: 0.2 }),
            }),
          }),
          expect.objectContaining({
            id: 'acc-inactive',
            emailAddress: 'inactive@example.com',
            active: false,
            usage: expect.objectContaining({
              five_hour: expect.objectContaining({ utilization: 0.8 }),
            }),
          }),
        ],
      }),
    );
  });

  it('returns error for inactive account with no cached usage', async () => {
    const connections = createMockConnections();
    const message: IPCMessage = {
      type: MessageType.GET_ALL_USAGE,
      payload: { force: true },
      timestamp: 0,
      requestId: 'req-no-cache',
    };

    mockExec.mockResolvedValue({
      stdout: JSON.stringify({ email: 'active@example.com' }),
      stderr: '',
    });

    mockReadRegistry.mockResolvedValue({
      current: 'acc-active',
      accounts: {
        'acc-active': {
          id: 'acc-active',
          emailAddress: 'active@example.com',
          displayName: 'Active User',
          organizationName: null,
          subscriptionType: null,
          authMethod: null,
          createdAt: 0,
          updatedAt: 0,
          usageCached: null,
          usageCachedAt: 0,
        },
        'acc-inactive': {
          id: 'acc-inactive',
          emailAddress: 'inactive@example.com',
          displayName: 'Inactive User',
          organizationName: null,
          subscriptionType: null,
          authMethod: null,
          createdAt: 0,
          updatedAt: 0,
          usageCached: null,
          usageCachedAt: 0,
        },
      },
      accountPools: [],
      accountOrder: [],
    });

    mockRunCcbUsage.mockResolvedValue({
      five_hour: { utilization: 0.5, resets_at: '2026-06-29T21:30:41Z' },
      seven_day: null,
      seven_day_oauth_apps: null,
      seven_day_sonnet: null,
      seven_day_opus: null,
      seven_day_cowork: null,
      iguana_necktie: null,
      extra_usage: null,
    });

    await getAllUsageHandler('conn-1', message, connections, mockBridge);

    expect(connections.sendTo).toHaveBeenCalledWith(
      'conn-1',
      MessageType.ACK,
      expect.objectContaining({
        status: 'ok',
        accounts: expect.arrayContaining([
          expect.objectContaining({
            id: 'acc-inactive',
            active: false,
            usage: null,
            error: expect.stringContaining('Switch to this account'),
            errorKind: 'unknown',
          }),
        ]),
      }),
    );
  });

  it('synthesizes entry if active account is not in the registry', async () => {
    const connections = createMockConnections();
    const message: IPCMessage = {
      type: MessageType.GET_ALL_USAGE,
      payload: { force: true },
      timestamp: 0,
      requestId: 'req-all-usage',
    };

    mockExec.mockResolvedValue({
      stdout: JSON.stringify({ email: 'live-only@example.com' }),
      stderr: '',
    });

    mockReadRegistry.mockResolvedValue({
      current: null,
      accounts: {},
      accountPools: [],
      accountOrder: [],
    });

    mockRunCcbUsage.mockResolvedValue({
      five_hour: { utilization: 0.5, resets_at: '2026-06-29T21:30:41Z' },
      seven_day: null,
      seven_day_oauth_apps: null,
      seven_day_sonnet: null,
      seven_day_opus: null,
      seven_day_cowork: null,
      iguana_necktie: null,
      extra_usage: null,
    });

    await getAllUsageHandler('conn-1', message, connections, mockBridge);

    expect(connections.sendTo).toHaveBeenCalledWith(
      'conn-1',
      MessageType.ACK,
      expect.objectContaining({
        requestId: 'req-all-usage',
        status: 'ok',
        accounts: [
          expect.objectContaining({
            id: 'live',
            emailAddress: 'live-only@example.com',
            active: true,
            usage: expect.objectContaining({
              five_hour: expect.objectContaining({ utilization: 0.5 }),
            }),
          }),
        ],
      }),
    );
  });

  it('returns error field if ccb fails for active account', async () => {
    const connections = createMockConnections();
    const message: IPCMessage = {
      type: MessageType.GET_ALL_USAGE,
      payload: { force: true },
      timestamp: 0,
      requestId: 'req-all-usage',
    };

    mockExec.mockResolvedValue({
      stdout: JSON.stringify({ email: 'active@example.com' }),
      stderr: '',
    });

    mockReadRegistry.mockResolvedValue({
      current: 'acc-active',
      accounts: {
        'acc-active': {
          id: 'acc-active',
          emailAddress: 'active@example.com',
          displayName: 'Active User',
          organizationName: null,
          subscriptionType: null,
          authMethod: null,
          createdAt: 0,
          updatedAt: 0,
          usageCached: null,
          usageCachedAt: 0,
        },
      },
      accountPools: [],
      accountOrder: [],
    });

    mockRunCcbUsage.mockRejectedValue(new Error('ccb error'));

    await getAllUsageHandler('conn-1', message, connections, mockBridge);

    expect(connections.sendTo).toHaveBeenCalledWith(
      'conn-1',
      MessageType.ACK,
      expect.objectContaining({
        requestId: 'req-all-usage',
        status: 'ok',
        accounts: [
          expect.objectContaining({
            id: 'acc-active',
            emailAddress: 'active@example.com',
            active: true,
            error: 'Test error',
            errorKind: 'unknown',
          }),
        ],
      }),
    );
  });
});
