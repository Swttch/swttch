/**
 * The webview's review diff answering a permission request.
 *
 * The IDE answers the same question through a JSON-RPC notification from
 * Kotlin; this is the same decision arriving as an ordinary webview request.
 * Both land on one resolver on purpose — two decision paths would eventually
 * disagree about what "kept nothing" means, and that disagreement writes files.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const sendControlResponseToProcess = vi.fn();
vi.mock('../../claude-process', () => ({
  sendControlResponseToProcess: (...args: unknown[]) => sendControlResponseToProcess(...args),
}));

import { resolveDiffHandler } from '../resolveDiff';
import { rememberPreview, clearPreviews, takePreview } from '../../features/diffPreview';
import { computeHunks } from '../../features/hunks';
import { MessageType, USER_DECLINED_PREFIX } from '../../../shared';

const original = 'debug: false\n';
const proposed = 'debug: true\n';

function fakeConnections() {
  const sent: { type: string; payload: Record<string, unknown> }[] = [];
  return {
    sent,
    sendTo: (_id: string, type: string, payload: Record<string, unknown>) => {
      sent.push({ type, payload });
    },
    broadcastToSession: vi.fn(),
  };
}

function pending(toolUseId: string) {
  rememberPreview(toolUseId, {
    filePath: '/tmp/config.txt',
    oldContent: original,
    newContent: proposed,
    hunks: computeHunks(original, proposed) ?? [],
    input: { file_path: '/tmp/config.txt', old_string: 'debug: false', new_string: 'debug: true' },
    toolName: 'Edit',
  });
}

function message(payload: Record<string, unknown>) {
  return { type: MessageType.RESOLVE_DIFF, requestId: 'r1', payload } as never;
}

beforeEach(() => {
  sendControlResponseToProcess.mockClear();
  clearPreviews();
});

describe('resolveDiffHandler', () => {
  it('answers the CLI with what the reviewer kept', async () => {
    const connections = fakeConnections();
    pending('toolu_1');

    await resolveDiffHandler('conn-1', message({
      toolUseId: 'toolu_1',
      controlRequestId: 'ctrl-1',
      sessionId: 'sess-1',
      acceptedRanges: [{ oldStart: 0, oldEnd: 1, newStart: 0, newEnd: 1 }],
    }), connections as never);

    const [, , response] = sendControlResponseToProcess.mock.calls[0];
    expect(response.response.behavior).toBe('allow');
    expect(connections.sent[0].payload.status).toBe('ok');
  });

  it('carries an edited proposal through to the write (#305)', async () => {
    const connections = fakeConnections();
    pending('toolu_edit');

    await resolveDiffHandler('conn-1', message({
      toolUseId: 'toolu_edit',
      controlRequestId: 'ctrl-1',
      sessionId: 'sess-1',
      acceptedRanges: [{ oldStart: 0, oldEnd: 1, newStart: 0, newEnd: 1 }],
      editedContent: 'debug: MAYBE\n',
    }), connections as never);

    const [, , response] = sendControlResponseToProcess.mock.calls[0];
    expect(response.response.updatedInput.new_string).toContain('debug: MAYBE');
  });

  it('treats keeping nothing as a denial, as the IDE does', async () => {
    const connections = fakeConnections();
    pending('toolu_none');

    await resolveDiffHandler('conn-1', message({
      toolUseId: 'toolu_none',
      controlRequestId: 'ctrl-1',
      sessionId: 'sess-1',
      acceptedRanges: [],
    }), connections as never);

    const [, , response] = sendControlResponseToProcess.mock.calls[0];
    expect(response.response.behavior).toBe('deny');
    expect(response.response.message).toContain(USER_DECLINED_PREFIX);
  });

  it('consumes the preview so a second answer cannot re-apply it', async () => {
    const connections = fakeConnections();
    pending('toolu_once');

    await resolveDiffHandler('conn-1', message({
      toolUseId: 'toolu_once',
      controlRequestId: 'ctrl-1',
      sessionId: 'sess-1',
      acceptedRanges: [{ oldStart: 0, oldEnd: 1, newStart: 0, newEnd: 1 }],
    }), connections as never);

    expect(takePreview('toolu_once')).toBeUndefined();
  });

  it('refuses a payload missing an id it must quote back', async () => {
    // Answering the wrong request would settle a question the user never saw.
    const connections = fakeConnections();

    await resolveDiffHandler('conn-1', message({
      toolUseId: 'toolu_1',
      sessionId: 'sess-1',
      acceptedRanges: [],
    }), connections as never);

    expect(sendControlResponseToProcess).not.toHaveBeenCalled();
    expect(connections.sent[0].payload.status).toBe('error');
  });
});
