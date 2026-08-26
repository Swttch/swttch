/**
 * The webview's review diff answering a permission request.
 *
 * The IDE answers the same question through a JSON-RPC notification from
 * Kotlin; this is the same decision arriving as an ordinary webview request.
 * Both land on one resolver on purpose — two decision paths would eventually
 * disagree about what "kept nothing" means, and that disagreement writes files.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

const sendControlResponseToProcess = vi.fn();
const sendMessageToProcess = vi.fn();
vi.mock('../../claude-process', () => ({
  sendControlResponseToProcess: (...args: unknown[]) => sendControlResponseToProcess(...args),
  sendMessageToProcess: (...args: unknown[]) => sendMessageToProcess(...args),
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

/**
 * The IDE side, reduced to the one call this handler makes on it: closing the
 * diff tab that asked the question.
 */
function fakeBridge() {
  return { closeDiffTab: vi.fn(async () => undefined) };
}

/*
 * A real file holding the review's base, because the approval gate re-reads it
 * before answering (#359). A fixture path that was never written would be held
 * by that gate, and every test here would be measuring the gate instead of the
 * handler.
 */
let dir: string;
let configPath: string;

function pending(toolUseId: string) {
  rememberPreview(toolUseId, {
    filePath: configPath,
    oldContent: original,
    newContent: proposed,
    hunks: computeHunks(original, proposed) ?? [],
    input: { file_path: configPath, old_string: 'debug: false', new_string: 'debug: true' },
    toolName: 'Edit',
  });
}

function message(payload: Record<string, unknown>) {
  return { type: MessageType.RESOLVE_DIFF, requestId: 'r1', payload } as never;
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'resolve-diff-handler-'));
  configPath = join(dir, 'config.txt');
  await writeFile(configPath, original, 'utf8');

  sendControlResponseToProcess.mockClear();
  sendMessageToProcess.mockClear();
  clearPreviews();
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
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
    }), connections as never, fakeBridge() as never);

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
    }), connections as never, fakeBridge() as never);

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
    }), connections as never, fakeBridge() as never);

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
    }), connections as never, fakeBridge() as never);

    expect(takePreview('toolu_once')).toBeUndefined();
  });

  it('refuses a payload missing an id it must quote back', async () => {
    // Answering the wrong request would settle a question the user never saw.
    const connections = fakeConnections();

    await resolveDiffHandler('conn-1', message({
      toolUseId: 'toolu_1',
      sessionId: 'sess-1',
      acceptedRanges: [],
    }), connections as never, fakeBridge() as never);

    expect(sendControlResponseToProcess).not.toHaveBeenCalled();
    expect(connections.sent[0].payload.status).toBe('error');
  });

  // The diff page fills a window of its own, so an answered request must not
  // leave that window sitting there asking a settled question.
  describe('closes the window the review was in', () => {
    it('closes the tab when the change is kept', async () => {
      const bridge = fakeBridge();
      pending('toolu_keep');

      await resolveDiffHandler('conn-1', message({
        toolUseId: 'toolu_keep',
        controlRequestId: 'ctrl-1',
        sessionId: 'sess-1',
        acceptedRanges: [{ oldStart: 0, oldEnd: 1, newStart: 0, newEnd: 1 }],
      }), fakeConnections() as never, bridge as never);

      expect(bridge.closeDiffTab).toHaveBeenCalledWith({ toolUseId: 'toolu_keep' });
    });

    it('closes the tab when the change is refused', async () => {
      const bridge = fakeBridge();
      pending('toolu_deny');

      await resolveDiffHandler('conn-1', message({
        toolUseId: 'toolu_deny',
        controlRequestId: 'ctrl-1',
        sessionId: 'sess-1',
        acceptedRanges: [],
      }), fakeConnections() as never, bridge as never);

      expect(bridge.closeDiffTab).toHaveBeenCalledWith({ toolUseId: 'toolu_deny' });
    });

    // Nothing stored means the request was already answered elsewhere — and a
    // tab opened for it is exactly what would still be on screen.
    it('closes the tab for a request it holds no preview for', async () => {
      const bridge = fakeBridge();

      await resolveDiffHandler('conn-1', message({
        toolUseId: 'toolu_gone',
        controlRequestId: 'ctrl-1',
        sessionId: 'sess-1',
        acceptedRanges: [],
      }), fakeConnections() as never, bridge as never);

      expect(bridge.closeDiffTab).toHaveBeenCalledWith({ toolUseId: 'toolu_gone' });
    });

    // A tab that will not close must not take the decision down with it: the
    // answer has already gone to the CLI by then.
    it('still answers when closing the tab fails', async () => {
      const bridge = { closeDiffTab: vi.fn(async () => { throw new Error('no such tab'); }) };
      pending('toolu_err');

      await resolveDiffHandler('conn-1', message({
        toolUseId: 'toolu_err',
        controlRequestId: 'ctrl-1',
        sessionId: 'sess-1',
        acceptedRanges: [{ oldStart: 0, oldEnd: 1, newStart: 0, newEnd: 1 }],
      }), fakeConnections() as never, bridge as never);

      expect(sendControlResponseToProcess).toHaveBeenCalled();
    });
  });
});
