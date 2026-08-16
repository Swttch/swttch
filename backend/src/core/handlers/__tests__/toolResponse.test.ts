import { describe, it, expect, vi, beforeEach } from 'vitest';
import { USER_DECLINED_PREFIX } from '../../../shared';

// Capture what the handler forwards to the CLI process.
const sendControlResponseToProcess = vi.fn();
const sendToolResultToProcess = vi.fn();
vi.mock('../../claude-process', () => ({
  sendControlResponseToProcess: (...args: unknown[]) => sendControlResponseToProcess(...args),
  sendToolResultToProcess: (...args: unknown[]) => sendToolResultToProcess(...args),
}));

import { toolResponseHandler } from '../toolResponse';
import { rememberPreview, takePreview, clearPreviews } from '../../features/diffPreview';
import { computeHunks } from '../../features/hunks';

function makeConnections() {
  return {
    getClient: () => ({ subscribedSessionId: 'sess-1' }),
    sendTo: vi.fn(),
  } as any;
}

const closeDiff = vi.fn().mockResolvedValue(undefined);
const bridge = { closeDiff } as any;

beforeEach(() => {
  sendControlResponseToProcess.mockClear();
  sendToolResultToProcess.mockClear();
  closeDiff.mockClear();
});

describe('toolResponseHandler — permission denial (control_response path)', () => {
  it('stamps the USER_DECLINED_PREFIX marker on a bare denial', () => {
    toolResponseHandler(
      'conn-1',
      { requestId: 'r1', payload: { toolUseId: 't1', approved: false, controlRequestId: 'ctrl-1' } } as any,
      makeConnections(),
      bridge,
    );

    expect(sendControlResponseToProcess).toHaveBeenCalledTimes(1);
    const [, , response] = sendControlResponseToProcess.mock.calls[0];
    expect(response.response.behavior).toBe('deny');
    expect(response.response.message).toBe(USER_DECLINED_PREFIX);
  });

  it('embeds the user reason after the marker (still detectable as a decline)', () => {
    toolResponseHandler(
      'conn-1',
      {
        requestId: 'r1',
        payload: { toolUseId: 't1', approved: false, controlRequestId: 'ctrl-1', reason: 'use echo instead' },
      } as any,
      makeConnections(),
      bridge,
    );

    const [, , response] = sendControlResponseToProcess.mock.calls[0];
    expect(response.response.message.startsWith(USER_DECLINED_PREFIX)).toBe(true);
    expect(response.response.message).toContain('use echo instead');
  });

  it('approval sends behavior:allow (no marker)', () => {
    toolResponseHandler(
      'conn-1',
      { requestId: 'r1', payload: { toolUseId: 't1', approved: true, controlRequestId: 'ctrl-1' } } as any,
      makeConnections(),
      bridge,
    );

    const [, , response] = sendControlResponseToProcess.mock.calls[0];
    expect(response.response.behavior).toBe('allow');
  });
});

describe('toolResponseHandler — legacy tool_result path (no controlRequestId)', () => {
  it('denial stamps the marker, sets is_error, and ignores payload.result', () => {
    toolResponseHandler(
      'conn-1',
      // no controlRequestId → legacy branch; a stale `result` must not leak through
      { requestId: 'r1', payload: { toolUseId: 't1', approved: false, result: 'Tool execution rejected', reason: 'use ls instead' } } as any,
      makeConnections(),
      bridge,
    );

    expect(sendToolResultToProcess).toHaveBeenCalledTimes(1);
    const [, , toolResult] = sendToolResultToProcess.mock.calls[0];
    expect(toolResult.type).toBe('tool_result');
    expect(toolResult.tool_use_id).toBe('t1');
    expect(toolResult.is_error).toBe(true);
    expect(toolResult.content.startsWith(USER_DECLINED_PREFIX)).toBe(true);
    expect(toolResult.content).toContain('use ls instead');
    expect(toolResult.content).not.toBe('Tool execution rejected');
  });

  it('approval forwards the tool result with is_error:false', () => {
    toolResponseHandler(
      'conn-1',
      { requestId: 'r1', payload: { toolUseId: 't1', approved: true, result: 'done' } } as any,
      makeConnections(),
      bridge,
    );

    const [, , toolResult] = sendToolResultToProcess.mock.calls[0];
    expect(toolResult.is_error).toBe(false);
    expect(toolResult.content).toBe('done');
  });
});

describe('toolResponseHandler — IDE review diff cleanup', () => {
  // The diff was opened to answer a question. Once answered, leaving it behind
  // means a stale preview per edit for the user to close by hand.
  it('closes the diff after an approval', () => {
    toolResponseHandler(
      'conn-1',
      { requestId: 'r1', payload: { toolUseId: 't1', approved: true, controlRequestId: 'ctrl-1' } } as any,
      makeConnections(),
      bridge,
    );
    expect(closeDiff).toHaveBeenCalledWith({ toolUseId: 't1' });
  });

  it('closes the diff after a denial too', () => {
    toolResponseHandler(
      'conn-1',
      { requestId: 'r1', payload: { toolUseId: 't1', approved: false, controlRequestId: 'ctrl-1' } } as any,
      makeConnections(),
      bridge,
    );
    expect(closeDiff).toHaveBeenCalledWith({ toolUseId: 't1' });
  });

  it('does not ask the IDE to close anything when there is no tool id', () => {
    toolResponseHandler(
      'conn-1',
      { requestId: 'r1', payload: { approved: true, controlRequestId: 'ctrl-1' } } as any,
      makeConnections(),
      bridge,
    );
    expect(closeDiff).not.toHaveBeenCalled();
  });

  it('still answers the CLI when closing the diff fails', async () => {
    // A dead IDE connection must not swallow the user's decision.
    closeDiff.mockRejectedValueOnce(new Error('no IDE'));

    toolResponseHandler(
      'conn-1',
      { requestId: 'r1', payload: { toolUseId: 't1', approved: true, controlRequestId: 'ctrl-1' } } as any,
      makeConnections(),
      bridge,
    );

    expect(sendControlResponseToProcess).toHaveBeenCalledTimes(1);
    // Let the rejected promise settle so the suite does not see it as unhandled.
    await Promise.resolve();
  });
});

describe('toolResponseHandler — partial approval (#109)', () => {
  const original = ['debug: false', ...Array.from({ length: 8 }, (_, i) => `pad-${i}`), 'timeout: 30'].join('\n') + '\n';
  const proposed = original.replace('debug: false', 'debug: true').replace('timeout: 30', 'timeout: 60');

  function pending(toolUseId: string) {
    const hunks = computeHunks(original, proposed)!;
    rememberPreview(toolUseId, {
      filePath: '/tmp/config.txt',
      oldContent: original,
      newContent: proposed,
      hunks,
      input: { file_path: '/tmp/config.txt', old_string: 'x', new_string: 'y' },
      toolName: 'Edit',
    });
    return hunks;
  }

  beforeEach(() => clearPreviews());

  it('rewrites the tool input to just the kept hunk', () => {
    pending('t-partial');
    toolResponseHandler(
      'conn-1',
      { requestId: 'r1', payload: { toolUseId: 't-partial', approved: true, controlRequestId: 'ctrl-1', acceptedHunks: [0] } } as any,
      makeConnections(),
      bridge,
    );

    const [, , response] = sendControlResponseToProcess.mock.calls[0];
    expect(response.response.behavior).toBe('allow');
    const input = response.response.updatedInput;
    // Stays in Edit shape: the CLI rejects a Write-shaped input for an Edit
    // ("File has not been read yet"), measured against the CLI itself.
    expect(input.old_string).toBeDefined();
    expect(original).toContain(input.old_string);
    expect(input.new_string).toContain('debug: true');
    expect(input.new_string).not.toContain('timeout: 60');
  });

  it('leaves a full acceptance exactly as the CLI proposed it', () => {
    const hunks = pending('t-full');
    toolResponseHandler(
      'conn-1',
      { requestId: 'r1', payload: { toolUseId: 't-full', approved: true, controlRequestId: 'ctrl-1', acceptedHunks: hunks.map(h => h.index) } } as any,
      makeConnections(),
      bridge,
    );

    const [, , response] = sendControlResponseToProcess.mock.calls[0];
    // Nothing amended — approving everything is the request unchanged.
    expect(response.response.updatedInput).toEqual({});
  });

  it('treats keeping nothing as a denial', () => {
    // Writing the file back unchanged would report success for an edit that
    // never happened, and Claude would carry on believing it landed.
    pending('t-none');
    toolResponseHandler(
      'conn-1',
      { requestId: 'r1', payload: { toolUseId: 't-none', approved: true, controlRequestId: 'ctrl-1', acceptedHunks: [] } } as any,
      makeConnections(),
      bridge,
    );

    const [, , response] = sendControlResponseToProcess.mock.calls[0];
    expect(response.response.behavior).toBe('deny');
  });

  it('ignores hunk numbers for a request that has no stored preview', () => {
    toolResponseHandler(
      'conn-1',
      { requestId: 'r1', payload: { toolUseId: 't-unknown', approved: true, controlRequestId: 'ctrl-1', acceptedHunks: [0] } } as any,
      makeConnections(),
      bridge,
    );

    const [, , response] = sendControlResponseToProcess.mock.calls[0];
    expect(response.response.behavior).toBe('allow');
    expect(response.response.updatedInput).toEqual({});
  });

  it('consumes the preview, so a repeat decision cannot re-apply it', () => {
    pending('t-once');
    const msg = { requestId: 'r1', payload: { toolUseId: 't-once', approved: true, controlRequestId: 'ctrl-1', acceptedHunks: [0] } } as any;
    toolResponseHandler('conn-1', msg, makeConnections(), bridge);
    toolResponseHandler('conn-1', msg, makeConnections(), bridge);

    const second = sendControlResponseToProcess.mock.calls[1][2];
    expect(second.response.updatedInput).toEqual({});
  });

  it('drops the preview when the user denies outright', () => {
    pending('t-denied');
    toolResponseHandler(
      'conn-1',
      { requestId: 'r1', payload: { toolUseId: 't-denied', approved: false, controlRequestId: 'ctrl-1' } } as any,
      makeConnections(),
      bridge,
    );
    expect(takePreview('t-denied')).toBeUndefined();
  });
});
