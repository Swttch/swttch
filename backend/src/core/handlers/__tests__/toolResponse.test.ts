import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
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
// Both review surfaces are told, because which one a request opened depends on
// a setting that may have changed since — see toolResponseHandler.
const closeDiffTab = vi.fn().mockResolvedValue(undefined);
const bridge = { closeDiff, closeDiffTab } as any;

beforeEach(() => {
  sendControlResponseToProcess.mockClear();
  sendToolResultToProcess.mockClear();
  closeDiff.mockClear();
  closeDiffTab.mockClear();
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

describe('toolResponseHandler — review surface cleanup', () => {
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
    expect(closeDiffTab).toHaveBeenCalledWith({ toolUseId: 't1' });
  });

  it('closes the diff after a denial too', () => {
    toolResponseHandler(
      'conn-1',
      { requestId: 'r1', payload: { toolUseId: 't1', approved: false, controlRequestId: 'ctrl-1' } } as any,
      makeConnections(),
      bridge,
    );
    expect(closeDiff).toHaveBeenCalledWith({ toolUseId: 't1' });
    expect(closeDiffTab).toHaveBeenCalledWith({ toolUseId: 't1' });
  });

  it('does not ask the IDE to close anything when there is no tool id', () => {
    toolResponseHandler(
      'conn-1',
      { requestId: 'r1', payload: { approved: true, controlRequestId: 'ctrl-1' } } as any,
      makeConnections(),
      bridge,
    );
    expect(closeDiff).not.toHaveBeenCalled();
    expect(closeDiffTab).not.toHaveBeenCalled();
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

  it('still answers the CLI when closing the diff tab fails', async () => {
    // Same contract for the other surface: the decision is already made.
    closeDiffTab.mockRejectedValueOnce(new Error('no such tab'));

    toolResponseHandler(
      'conn-1',
      { requestId: 'r1', payload: { toolUseId: 't1', approved: true, controlRequestId: 'ctrl-1' } } as any,
      makeConnections(),
      bridge,
    );

    expect(sendControlResponseToProcess).toHaveBeenCalledTimes(1);
    await Promise.resolve();
  });
});

describe('toolResponseHandler — pending preview cleanup', () => {
  let dir: string;

  beforeEach(async () => {
    clearPreviews();
    dir = await mkdtemp(join(tmpdir(), 'tool-response-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('consumes the stored preview so it cannot outlive its question', async () => {
    // Hunk selection happens in the IDE now, but a chat answer still ends the
    // request — leaving the preview behind would strand it until the cap sweeps.
    //
    // The file is written for real because the approval gate re-reads it before
    // answering (#359): a preview pointing at a path that was never created is
    // held rather than consumed, which is correct but not what this is about.
    const filePath = join(dir, 'a.ts');
    await writeFile(filePath, 'a', 'utf8');
    rememberPreview('t-chat', {
      filePath, oldContent: 'a', newContent: 'b',
      hunks: computeHunks('a', 'b')!, input: {}, toolName: 'Edit',
    });

    await toolResponseHandler(
      'conn-1',
      { requestId: 'r1', payload: { toolUseId: 't-chat', approved: true, controlRequestId: 'ctrl-1' } } as any,
      makeConnections(),
      bridge,
    );

    expect(takePreview('t-chat')).toBeUndefined();
  });
});
