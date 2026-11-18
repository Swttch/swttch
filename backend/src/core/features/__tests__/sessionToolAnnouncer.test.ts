import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../awaitSessionTranscript', () => ({
  awaitSessionTranscript: vi.fn(),
}));

vi.mock('../sessionMarks', () => ({
  readSessionMarksToShow: vi.fn(),
}));

vi.mock('../announceSessionCreated', () => ({
  announceSessionCreated: vi.fn(),
}));

vi.mock('../announceSessionStarting', () => ({
  announceSessionStarting: vi.fn(),
  announceSessionRequested: vi.fn(),
  dropSessionPlaceholder: vi.fn(),
  placeholderSessionId: (toolUseId: string) => `starting:${toolUseId}`,
}));

import { announceSessionToolChanges, isSessionStarting, resetSessionToolAnnouncer } from '../sessionToolAnnouncer';
import { awaitSessionTranscript } from '../awaitSessionTranscript';
import { readSessionMarksToShow, type SessionMark } from '../sessionMarks';
import { announceSessionCreated } from '../announceSessionCreated';
import { announceSessionRequested, announceSessionStarting, dropSessionPlaceholder } from '../announceSessionStarting';
import { MessageType } from '../../../shared';
import type { ConnectionManager } from '../../../ws/connection-manager';

const mockAwait = vi.mocked(awaitSessionTranscript);
const mockMarks = vi.mocked(readSessionMarksToShow);

function toolUse(id: string, name: string, input: Record<string, unknown> = {}): Record<string, unknown> {
  return { type: 'assistant', message: { content: [{ type: 'tool_use', id, name, input }] } };
}

/** A mark as the list reads it: the row of the package's table, kept whole. */
function markOf(row: Record<string, unknown>): SessionMark {
  return { row, sessionId: String(row.id), toJSON: () => row } as unknown as SessionMark;
}

/** Lets the announcement that reads the marks first finish. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function toolResult(id: string, content: unknown, isError = false): Record<string, unknown> {
  return {
    type: 'user',
    message: { content: [{ type: 'tool_result', tool_use_id: id, content, is_error: isError }] },
  };
}

/**
 * The session lists are told when a session this backend runs changes them
 * through the session-management MCP, which is another program: all this
 * backend sees of it is the tool call and its answer in the CLI's stream.
 */
describe('announceSessionToolChanges', () => {
  let broadcastToAll: ReturnType<typeof vi.fn>;
  let connections: ConnectionManager;

  beforeEach(() => {
    vi.clearAllMocks();
    resetSessionToolAnnouncer();
    broadcastToAll = vi.fn();
    connections = { broadcastToAll } as unknown as ConnectionManager;
    mockMarks.mockResolvedValue(new Map());
    vi.mocked(announceSessionStarting).mockResolvedValue(undefined);
  });

  it('tells the screens a started session is there at once, with the name it was given, before its transcript exists', () => {
    announceSessionToolChanges(toolUse('call-1', 'mcp__swttch_session__start_session', { title: '* Review env' }), connections);
    announceSessionToolChanges(
      toolResult('call-1', [
        { type: 'text', text: JSON.stringify({ session_id: 'child', name: 'deploy', cwd: '/work' }) },
      ]),
      connections,
    );

    expect(announceSessionStarting).toHaveBeenCalledWith(connections, { sessionId: 'child', cwd: '/work' }, '* Review env');
    expect(announceSessionCreated).not.toHaveBeenCalled();
  });

  it('then waits for the transcript of the started session, and hands over its row', () => {
    announceSessionToolChanges(toolUse('call-1', 'mcp__swttch_session__start_session'), connections);
    announceSessionToolChanges(
      toolResult('call-1', [
        { type: 'text', text: JSON.stringify({ session_id: 'child', name: 'deploy', cwd: '/work' }) },
      ]),
      connections,
    );

    // Nothing yet: the row is read from the transcript and this one is not written.
    expect(announceSessionCreated).not.toHaveBeenCalled();
    expect(mockAwait).toHaveBeenCalledWith('child', '/work', expect.any(Function), expect.any(Function));

    mockAwait.mock.calls[0][2]();
    expect(announceSessionCreated).toHaveBeenCalledWith(connections, 'child', '/work');
    expect(broadcastToAll).not.toHaveBeenCalled();
  });

  it('takes back the session it told the screens about when no transcript ever comes', () => {
    const broadcastToListsHolding = vi.fn();
    connections = { broadcastToAll, broadcastToListsHolding } as unknown as ConnectionManager;
    announceSessionToolChanges(toolUse('call-1', 'mcp__swttch_session__start_session'), connections);
    announceSessionToolChanges(
      toolResult('call-1', [{ type: 'text', text: JSON.stringify({ session_id: 'child', cwd: '/work' }) }]),
      connections,
    );

    mockAwait.mock.calls[0][3]?.();

    expect(broadcastToListsHolding).toHaveBeenCalledWith(
      MessageType.SESSIONS_UPDATED,
      { action: 'delete', session: { sessionId: 'child' }, ts: expect.any(Number) },
      ['/work'],
      undefined,
    );
  });

  it('reads an answer handed over as a plain string too', () => {
    announceSessionToolChanges(toolUse('call-1', 'mcp__swttch_session__start_session'), connections);
    announceSessionToolChanges(
      toolResult('call-1', JSON.stringify({ session_id: 'child', cwd: '/work' })),
      connections,
    );

    expect(mockAwait).toHaveBeenCalledWith('child', '/work', expect.any(Function), expect.any(Function));
  });

  it.each(['detach_session', 'delete_session'])(
    'asks the lists to read again right after %s answers',
    (tool) => {
      announceSessionToolChanges(toolUse('call-1', `mcp__swttch_session_mgmt__${tool}`), connections);
      announceSessionToolChanges(toolResult('call-1', '{"detached":true}'), connections);

      expect(broadcastToAll).toHaveBeenCalledTimes(1);
      expect(broadcastToAll).toHaveBeenCalledWith(MessageType.SESSIONS_UPDATED, { action: 'refresh', ts: expect.any(Number) }, undefined);
      expect(mockAwait).not.toHaveBeenCalled();
    },
  );

  describe.each(['archive_session', 'unarchive_session'])('right after %s answers', (tool) => {
    const call = (input: Record<string, unknown>, caller: string | undefined = 'caller-id') => {
      announceSessionToolChanges(toolUse('call-1', `mcp__swttch_session_mgmt__${tool}`, input), connections, caller);
      announceSessionToolChanges(toolResult('call-1', 'ok'), connections, caller);
    };
    const refresh = [MessageType.SESSIONS_UPDATED, { action: 'refresh', ts: expect.any(Number) }, undefined];

    it('hands the screens the new mark of that session as an update, and nothing else', async () => {
      mockMarks.mockResolvedValue(new Map([['target', markOf({ id: 'target', archivedAt: 1700 })]]));

      call({ session_id: 'target' });
      await settle();

      expect(broadcastToAll.mock.calls).toEqual([
        [
          MessageType.SESSIONS_UPDATED,
          { action: 'update', session: { sessionId: 'target', sessionMark: { id: 'target', archivedAt: 1700 } }, ts: expect.any(Number) },
          undefined,
        ],
      ]);
    });

    it('takes "self" to be the session whose stream carried the call', async () => {
      mockMarks.mockResolvedValue(new Map([['caller-id', markOf({ id: 'caller-id', archivedAt: 1700 })]]));

      call({ session_id: 'self' });
      await settle();

      expect(broadcastToAll.mock.calls[0][1]).toEqual({
        action: 'update',
        session: { sessionId: 'caller-id', sessionMark: { id: 'caller-id', archivedAt: 1700 } },
        ts: expect.any(Number),
      });
    });

    it('sends the update only to the screens whose list can hold the session, when the caller is the session and its folder is known', async () => {
      mockMarks.mockResolvedValue(new Map([['caller-id', markOf({ id: 'caller-id', archivedAt: 1700 })]]));
      const broadcastToListsHolding = vi.fn();
      connections = { broadcastToAll, broadcastToListsHolding } as unknown as ConnectionManager;

      announceSessionToolChanges(toolUse('call-1', `mcp__swttch_session_mgmt__${tool}`, { session_id: 'self' }), connections, 'caller-id', '/repo');
      announceSessionToolChanges(toolResult('call-1', 'ok'), connections, 'caller-id', '/repo');
      await settle();

      expect(broadcastToAll).not.toHaveBeenCalled();
      expect(broadcastToListsHolding).toHaveBeenCalledWith(
        MessageType.SESSIONS_UPDATED,
        { action: 'update', session: { sessionId: 'caller-id', sessionMark: { id: 'caller-id', archivedAt: 1700 } }, ts: expect.any(Number) },
        ['/repo'],
        undefined,
      );
    });

    it('takes the folder from the mark when the session is not the caller', async () => {
      mockMarks.mockResolvedValue(new Map([['target', markOf({ id: 'target', archivedAt: 1700, cwd: '/elsewhere' })]]));
      const broadcastToListsHolding = vi.fn();
      connections = { broadcastToAll, broadcastToListsHolding } as unknown as ConnectionManager;

      announceSessionToolChanges(toolUse('call-1', `mcp__swttch_session_mgmt__${tool}`, { session_id: 'target' }), connections, 'caller-id', '/repo');
      announceSessionToolChanges(toolResult('call-1', 'ok'), connections, 'caller-id', '/repo');
      await settle();

      expect(broadcastToListsHolding.mock.calls[0][2]).toEqual(['/elsewhere']);
    });

    it('asks the screens to read again when no mark is kept for that session', async () => {
      call({ session_id: 'target' });
      await settle();

      expect(broadcastToAll.mock.calls).toEqual([refresh]);
    });

    it('asks the screens to read again when the marks cannot be read', async () => {
      mockMarks.mockRejectedValue(new Error('disk'));

      call({ session_id: 'target' });
      await settle();

      expect(broadcastToAll.mock.calls).toEqual([refresh]);
    });

    it('says nothing when the tool refused', async () => {
      announceSessionToolChanges(toolUse('call-1', `mcp__swttch_session_mgmt__${tool}`, { session_id: 'target' }), connections, 'caller-id');
      announceSessionToolChanges(toolResult('call-1', 'unavailable', true), connections, 'caller-id');
      await settle();

      expect(broadcastToAll).not.toHaveBeenCalled();
      expect(mockMarks).not.toHaveBeenCalled();
    });
  });

  describe('right after set_session_title answers', () => {
    const call = (input: Record<string, unknown>, caller: string | undefined = 'caller-id') => {
      announceSessionToolChanges(toolUse('call-1', 'mcp__swttch_session_mgmt__set_session_title', input), connections, caller);
      announceSessionToolChanges(toolResult('call-1', 'ok'), connections, caller);
    };
    const refresh = [MessageType.SESSIONS_UPDATED, { action: 'refresh', ts: expect.any(Number) }, undefined];

    it('hands the screens the new name as an update of that session, as the CLI will keep it', () => {
      call({ session_id: 'target', title: '  New\n  name  ' });

      expect(broadcastToAll.mock.calls).toEqual([
        [MessageType.SESSIONS_UPDATED, { action: 'update', session: { sessionId: 'target', title: 'New name' }, ts: expect.any(Number) }, undefined],
      ]);
    });

    it('takes "self" to be the session whose stream carried the call', () => {
      call({ session_id: 'self', title: 'Mine' });

      expect(broadcastToAll.mock.calls[0][1]).toEqual({
        action: 'update',
        session: { sessionId: 'caller-id', title: 'Mine' },
        ts: expect.any(Number),
      });
    });

    it('asks the screens to read again when the call names no session or no name', () => {
      call({ title: 'No session' });
      call({ session_id: 'target', title: '   ' });

      expect(broadcastToAll.mock.calls).toEqual([refresh, refresh]);
    });

    it('says nothing when the tool refused', () => {
      announceSessionToolChanges(
        toolUse('call-1', 'mcp__swttch_session_mgmt__set_session_title', { session_id: 'target', title: 'X' }),
        connections,
        'caller-id',
      );
      announceSessionToolChanges(toolResult('call-1', 'unavailable', true), connections, 'caller-id');

      expect(broadcastToAll).not.toHaveBeenCalled();
    });
  });

  it('says nothing when the tool refused', () => {
    announceSessionToolChanges(toolUse('call-1', 'mcp__swttch_session_mgmt__detach_session'), connections);
    announceSessionToolChanges(toolResult('call-1', 'unavailable: not yours to detach', true), connections);

    expect(broadcastToAll).not.toHaveBeenCalled();
  });

  it('says nothing for a tool that only reads, or for any other tool', () => {
    announceSessionToolChanges(toolUse('call-1', 'mcp__swttch_session_mgmt__list_sessions'), connections);
    announceSessionToolChanges(toolResult('call-1', '[]'), connections);
    announceSessionToolChanges(toolUse('call-2', 'Bash'), connections);
    announceSessionToolChanges(toolResult('call-2', 'ok'), connections);

    expect(broadcastToAll).not.toHaveBeenCalled();
    expect(mockAwait).not.toHaveBeenCalled();
  });

  it('announces one change once, however often the answer is seen again', () => {
    announceSessionToolChanges(toolUse('call-1', 'mcp__swttch_session_mgmt__archive_session'), connections);
    announceSessionToolChanges(toolResult('call-1', '{}'), connections);
    announceSessionToolChanges(toolResult('call-1', '{}'), connections);

    expect(broadcastToAll).toHaveBeenCalledTimes(1);
  });

  it('does not wait for a start whose answer names no session', () => {
    announceSessionToolChanges(toolUse('call-1', 'mcp__swttch_session__start_session'), connections);
    announceSessionToolChanges(toolResult('call-1', 'queued for the user to confirm'), connections);

    expect(mockAwait).not.toHaveBeenCalled();
    expect(broadcastToAll).not.toHaveBeenCalled();
  });
});

/**
 * The session is in the lists from the moment the call that starts it goes out, as the desktop app has it in its
 * list the moment the card is in the conversation: the call already says its name and where it works, and the
 * session that made the call is the one that started it. The answer replaces that row with the real one.
 */
describe('announceSessionToolChanges: a start that is not answered yet', () => {
  const connections = { broadcastToAll: vi.fn() } as unknown as ConnectionManager;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    resetSessionToolAnnouncer();
    mockMarks.mockResolvedValue(new Map());
    vi.mocked(announceSessionStarting).mockResolvedValue(undefined);
  });

  it('puts a row made of the call into the lists, under the session that made the call', () => {
    announceSessionToolChanges(toolUse('call-1', 'mcp__swttch_session__start_session', { title: '* Review env' }), connections, 'parent', '/work');

    expect(announceSessionRequested).toHaveBeenCalledWith(connections, {
      placeholderId: 'starting:call-1',
      cwd: '/work',
      title: '* Review env',
      startedBy: 'parent',
    });
  });

  it('uses the folder the call names over the folder of the session that made it', () => {
    announceSessionToolChanges(toolUse('call-1', 'mcp__swttch_session__start_session', { title: 'x', cwd: '/elsewhere' }), connections, 'parent', '/work');

    expect(announceSessionRequested).toHaveBeenCalledWith(connections, expect.objectContaining({ cwd: '/elsewhere' }));
  });

  it('puts nothing in the lists when the call has no name or no folder to say', () => {
    announceSessionToolChanges(toolUse('call-1', 'mcp__swttch_session__start_session', {}), connections, 'parent', '/work');
    announceSessionToolChanges(toolUse('call-2', 'mcp__swttch_session__start_session', { title: 'x' }), connections, 'parent');

    expect(announceSessionRequested).not.toHaveBeenCalled();
  });

  it('takes that row away once the answer has named the real session', async () => {
    announceSessionToolChanges(toolUse('call-1', 'mcp__swttch_session__start_session', { title: 'x' }), connections, 'parent', '/work');
    announceSessionToolChanges(toolResult('call-1', JSON.stringify({ session_id: 'child', cwd: '/work' })), connections, 'parent', '/work');
    await settle();

    expect(announceSessionStarting).toHaveBeenCalledWith(connections, { sessionId: 'child', cwd: '/work' }, 'x');
    expect(dropSessionPlaceholder).toHaveBeenCalledWith(connections, expect.objectContaining({ placeholderId: 'starting:call-1', cwd: '/work' }));
  });

  it('takes that row away when the call failed', () => {
    announceSessionToolChanges(toolUse('call-1', 'mcp__swttch_session__start_session', { title: 'x' }), connections, 'parent', '/work');
    announceSessionToolChanges(toolResult('call-1', 'could not start', true), connections, 'parent', '/work');

    expect(dropSessionPlaceholder).toHaveBeenCalledWith(connections, expect.objectContaining({ placeholderId: 'starting:call-1' }));
    expect(announceSessionStarting).not.toHaveBeenCalled();
  });

  it('takes that row away when the call is never answered', () => {
    vi.useFakeTimers();
    announceSessionToolChanges(toolUse('call-1', 'mcp__swttch_session__start_session', { title: 'x' }), connections, 'parent', '/work');
    expect(dropSessionPlaceholder).not.toHaveBeenCalled();

    vi.advanceTimersByTime(121_000);

    expect(dropSessionPlaceholder).toHaveBeenCalledWith(connections, expect.objectContaining({ placeholderId: 'starting:call-1' }));
    vi.useRealTimers();
  });
});

/**
 * A session just started has no transcript for many seconds. It is not a deleted one, and what is asked about
 * missing transcripts has to be able to tell.
 */
describe('announceSessionToolChanges: a session that is starting', () => {
  const connections = { broadcastToAll: vi.fn(), broadcastToListsHolding: vi.fn() } as unknown as ConnectionManager;

  beforeEach(() => {
    vi.clearAllMocks();
    resetSessionToolAnnouncer();
    mockMarks.mockResolvedValue(new Map());
    vi.mocked(announceSessionStarting).mockResolvedValue(undefined);
  });

  const start = () => {
    announceSessionToolChanges(toolUse('call-1', 'mcp__swttch_session__start_session', { title: 'x' }), connections);
    announceSessionToolChanges(toolResult('call-1', JSON.stringify({ session_id: 'child', cwd: '/work' })), connections);
  };

  it('is starting from the answer until its transcript is there', () => {
    expect(isSessionStarting('child')).toBe(false);
    start();
    expect(isSessionStarting('child')).toBe(true);

    mockAwait.mock.calls[0][2]();

    expect(isSessionStarting('child')).toBe(false);
  });

  it('is not starting any more when no transcript ever came', () => {
    start();
    mockAwait.mock.calls[0][3]?.();

    expect(isSessionStarting('child')).toBe(false);
  });
});
