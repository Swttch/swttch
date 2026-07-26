import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ConnectionManager } from '../../../ws/connection-manager';
import type { Bridge } from '../../../bridge/bridge-interface';
import type { IPCMessage } from '../../types';
import { MessageType, ScheduledMessageKind } from '../../../shared';

// Mock the engine so the handler test never touches real fs/timers.
const scheduleMessage = vi.fn(async (..._args: unknown[]) => {});
vi.mock('../../features/scheduled-messages', () => ({
  scheduleMessage: (...args: unknown[]) => scheduleMessage(...args),
  cancelSchedule: vi.fn(),
}));

// Mock the persistence read used by GET_SCHEDULED_MESSAGES.
vi.mock('../../features/scheduled-messages-store', () => ({
  readSchedulesForSession: vi.fn(async () => []),
}));

// Mock the sponsor gate — the point of these tests.
const getSponsorStatus = vi.fn(async () => ({ isSponsor: true }));
vi.mock('../../features/license', () => ({
  getSponsorStatus: () => getSponsorStatus(),
}));

import { scheduleMessageHandler } from '../scheduleMessage';

function makeConnections() {
  return { sendTo: vi.fn() } as unknown as ConnectionManager;
}
const bridge = {} as Bridge;

function makeMessage(): IPCMessage {
  return {
    type: MessageType.SCHEDULE_MESSAGE,
    requestId: 'req-1',
    payload: {
      sessionId: 'sess-a',
      sendAt: '2026-03-30T11:00:00Z',
      message: 'continue',
      kind: ScheduledMessageKind.AUTO_RESUME,
    },
  } as unknown as IPCMessage;
}

describe('scheduleMessageHandler sponsor gate', () => {
  beforeEach(() => {
    scheduleMessage.mockClear();
    getSponsorStatus.mockReset();
  });

  it('rejects a non-sponsor without creating a reservation', async () => {
    getSponsorStatus.mockResolvedValue({ isSponsor: false });
    const connections = makeConnections();

    await scheduleMessageHandler('conn-1', makeMessage(), connections, bridge);

    expect(scheduleMessage).not.toHaveBeenCalled();
    expect(connections.sendTo).toHaveBeenCalledWith('conn-1', MessageType.ERROR, {
      requestId: 'req-1',
      error: 'Auto-resume is a sponsor-only feature',
    });
  });

  it('creates a reservation and ACKs for a sponsor', async () => {
    getSponsorStatus.mockResolvedValue({ isSponsor: true });
    const connections = makeConnections();

    await scheduleMessageHandler('conn-1', makeMessage(), connections, bridge);

    expect(scheduleMessage).toHaveBeenCalledTimes(1);
    expect(connections.sendTo).toHaveBeenCalledWith(
      'conn-1',
      MessageType.ACK,
      expect.objectContaining({ requestId: 'req-1' }),
    );
  });
});
