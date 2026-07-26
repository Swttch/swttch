import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ConnectionManager } from '../../../ws/connection-manager';
import type { Bridge } from '../../../bridge/bridge-interface';
import type { IPCMessage } from '../../types';
import { MessageType, ScheduledMessageKind, ErrorCode } from '../../../shared';

// Mock the engine so the handler test never touches real fs/timers.
const scheduleMessage = vi.fn(async (..._args: unknown[]) => {});
const editScheduledMessage = vi.fn(async (..._args: unknown[]) => true);
vi.mock('../../features/scheduled-messages', () => ({
  scheduleMessage: (...args: unknown[]) => scheduleMessage(...args),
  cancelSchedule: vi.fn(),
  editScheduledMessage: (...args: unknown[]) => editScheduledMessage(...args),
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

import { scheduleMessageHandler, updateScheduledMessageHandler } from '../scheduleMessage';

function makeConnections(panelId: string | null = 'panel-a') {
  return {
    sendTo: vi.fn(),
    // The handler reads the requesting tab's panelId off its client record to
    // stamp the reservation.
    getClient: vi.fn(() => ({ panelId })),
  } as unknown as ConnectionManager;
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
    editScheduledMessage.mockClear();
    getSponsorStatus.mockReset();
  });

  it('rejects a non-sponsor without creating a reservation', async () => {
    getSponsorStatus.mockResolvedValue({ isSponsor: false });
    const connections = makeConnections();

    await scheduleMessageHandler('conn-1', makeMessage(), connections, bridge);

    expect(scheduleMessage).not.toHaveBeenCalled();
    expect(connections.sendTo).toHaveBeenCalledWith('conn-1', MessageType.ERROR, {
      requestId: 'req-1',
      error: 'Sponsor-only feature',
      errorCode: ErrorCode.SPONSOR_REQUIRED,
    });
  });

  it('creates a reservation (stamped with the requesting tab panelId) and ACKs for a sponsor', async () => {
    getSponsorStatus.mockResolvedValue({ isSponsor: true });
    const connections = makeConnections('panel-a');

    await scheduleMessageHandler('conn-1', makeMessage(), connections, bridge);

    expect(scheduleMessage).toHaveBeenCalledTimes(1);
    // The reservation carries the tab's panelId (read from the client record).
    expect(scheduleMessage.mock.calls[0][0]).toMatchObject({
      sessionId: 'sess-a',
      message: 'continue',
      panelId: 'panel-a',
    });
    expect(connections.sendTo).toHaveBeenCalledWith(
      'conn-1',
      MessageType.ACK,
      expect.objectContaining({ requestId: 'req-1' }),
    );
  });

  it('leaves panelId undefined when the tab has none (standalone/browser)', async () => {
    getSponsorStatus.mockResolvedValue({ isSponsor: true });
    const connections = makeConnections(null);

    await scheduleMessageHandler('conn-1', makeMessage(), connections, bridge);

    expect(scheduleMessage.mock.calls[0][0]).toMatchObject({ sessionId: 'sess-a' });
    expect((scheduleMessage.mock.calls[0][0] as { panelId?: string }).panelId).toBeUndefined();
  });

  // ── Update (edit) ──────────────────────────────────────────────────────────

  function makeUpdateMessage(): IPCMessage {
    return {
      type: MessageType.UPDATE_SCHEDULED_MESSAGE,
      requestId: 'req-u',
      payload: { sessionId: 'sess-a', id: 'r1', message: 'edited', sendAt: '2031-01-01T00:00:00Z' },
    } as unknown as IPCMessage;
  }

  it('rejects a non-sponsor update without editing', async () => {
    getSponsorStatus.mockResolvedValue({ isSponsor: false });
    const connections = makeConnections();

    await updateScheduledMessageHandler('conn-1', makeUpdateMessage(), connections, bridge);

    expect(editScheduledMessage).not.toHaveBeenCalled();
    expect(connections.sendTo).toHaveBeenCalledWith('conn-1', MessageType.ERROR, {
      requestId: 'req-u',
      error: 'Sponsor-only feature',
      errorCode: ErrorCode.SPONSOR_REQUIRED,
    });
  });

  it('edits the reservation (message + sendAt) and ACKs for a sponsor', async () => {
    getSponsorStatus.mockResolvedValue({ isSponsor: true });
    const connections = makeConnections();

    await updateScheduledMessageHandler('conn-1', makeUpdateMessage(), connections, bridge);

    expect(editScheduledMessage).toHaveBeenCalledWith(
      'sess-a',
      'r1',
      { message: 'edited', sendAt: '2031-01-01T00:00:00Z' },
      connections,
    );
    expect(connections.sendTo).toHaveBeenCalledWith(
      'conn-1',
      MessageType.ACK,
      expect.objectContaining({ requestId: 'req-u' }),
    );
  });

  it('errors when the update is missing sessionId/id', async () => {
    getSponsorStatus.mockResolvedValue({ isSponsor: true });
    const connections = makeConnections();
    const msg = {
      type: MessageType.UPDATE_SCHEDULED_MESSAGE,
      requestId: 'req-u',
      payload: { message: 'edited' },
    } as unknown as IPCMessage;

    await updateScheduledMessageHandler('conn-1', msg, connections, bridge);

    expect(editScheduledMessage).not.toHaveBeenCalled();
    expect(connections.sendTo).toHaveBeenCalledWith('conn-1', MessageType.ERROR, {
      requestId: 'req-u',
      error: 'sessionId and id are required',
    });
  });
});
