import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../awaitSessionTranscript', () => ({
  awaitSessionTranscript: vi.fn(),
}));

import { announceSessionToolChanges, resetSessionToolAnnouncer } from '../sessionToolAnnouncer';
import { awaitSessionTranscript } from '../awaitSessionTranscript';
import { MessageType } from '../../../shared';
import type { ConnectionManager } from '../../../ws/connection-manager';

const mockAwait = vi.mocked(awaitSessionTranscript);

function toolUse(id: string, name: string): Record<string, unknown> {
  return { type: 'assistant', message: { content: [{ type: 'tool_use', id, name, input: {} }] } };
}

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
  });

  it('waits for the transcript of a started session, then announces that session', () => {
    announceSessionToolChanges(toolUse('call-1', 'mcp__swttch_session__start_session'), connections);
    announceSessionToolChanges(
      toolResult('call-1', [
        { type: 'text', text: JSON.stringify({ session_id: 'child', name: 'deploy', cwd: '/work' }) },
      ]),
      connections,
    );

    // Nothing yet: the list is read from transcripts and this one is not written.
    expect(broadcastToAll).not.toHaveBeenCalled();
    expect(mockAwait).toHaveBeenCalledWith('child', '/work', expect.any(Function));

    mockAwait.mock.calls[0][2]();
    expect(broadcastToAll).toHaveBeenCalledWith(MessageType.SESSIONS_UPDATED, {
      action: 'upsert',
      session: { sessionId: 'child' },
    });
  });

  it('reads an answer handed over as a plain string too', () => {
    announceSessionToolChanges(toolUse('call-1', 'mcp__swttch_session__start_session'), connections);
    announceSessionToolChanges(
      toolResult('call-1', JSON.stringify({ session_id: 'child', cwd: '/work' })),
      connections,
    );

    expect(mockAwait).toHaveBeenCalledWith('child', '/work', expect.any(Function));
  });

  it.each(['detach_session', 'archive_session', 'unarchive_session', 'delete_session', 'set_session_title'])(
    'asks the lists to read again right after %s answers',
    (tool) => {
      announceSessionToolChanges(toolUse('call-1', `mcp__swttch_session_mgmt__${tool}`), connections);
      announceSessionToolChanges(toolResult('call-1', '{"detached":true}'), connections);

      expect(broadcastToAll).toHaveBeenCalledTimes(1);
      expect(broadcastToAll).toHaveBeenCalledWith(MessageType.SESSIONS_UPDATED, { action: 'refresh' });
      expect(mockAwait).not.toHaveBeenCalled();
    },
  );

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
