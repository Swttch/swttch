import { describe, it, expect, beforeEach } from 'vitest';
import {
  cancelControlResponse,
  nextControlRequestId,
  resetControlResponseWaiters,
  settleControlResponse,
  waitForControlResponse,
} from '../control-response-waiter';

/** The envelope the CLI actually sends, measured against CLI 2.1.x. */
function successEvent(requestId: string, payload: unknown): Record<string, unknown> {
  return {
    type: 'control_response',
    response: { subtype: 'success', request_id: requestId, response: payload },
  };
}

describe('control-response-waiter', () => {
  beforeEach(() => resetControlResponseWaiters());

  it('resolves the waiter whose request_id the reply carries', async () => {
    const waiting = waitForControlResponse<{ ok: boolean }>('req-1', 1000);
    settleControlResponse(successEvent('req-1', { ok: true }));
    await expect(waiting).resolves.toEqual({ ok: true });
  });

  it('resolves each waiter with its own reply when several are in flight', async () => {
    const first = waitForControlResponse<string>('req-1', 1000);
    const second = waitForControlResponse<string>('req-2', 1000);
    settleControlResponse(successEvent('req-2', 'second'));
    settleControlResponse(successEvent('req-1', 'first'));
    await expect(first).resolves.toBe('first');
    await expect(second).resolves.toBe('second');
  });

  it('rejects with the CLI-reported reason on an error subtype', async () => {
    const waiting = waitForControlResponse('req-1', 1000);
    settleControlResponse({
      type: 'control_response',
      response: { subtype: 'error', request_id: 'req-1', error: 'unknown subtype' },
    });
    await expect(waiting).rejects.toThrow('unknown subtype');
  });

  it('rejects when no reply arrives, so a caller falls back instead of hanging', async () => {
    await expect(waitForControlResponse('req-1', 10)).rejects.toThrow(/timed out/);
  });

  it('leaves events that are not control_response alone', async () => {
    const waiting = waitForControlResponse('req-1', 50);
    settleControlResponse({ type: 'result', request_id: 'req-1' });
    await expect(waiting).rejects.toThrow(/timed out/);
  });

  it('ignores a reply nobody registered, which is every WebView-issued request', () => {
    expect(() => settleControlResponse(successEvent('webview-owned', { a: 1 }))).not.toThrow();
  });

  it('settles a cancelled waiter at once instead of leaving it pending forever', async () => {
    const waiting = waitForControlResponse('req-1', 30_000);
    cancelControlResponse('req-1');
    // Rejecting on cancel is what keeps the timeout from being the only exit: a
    // request that was never written has nothing to wait for.
    await expect(waiting).rejects.toThrow(/cancelled/);
  });

  it('does not resolve a cancelled waiter when a late reply turns up', async () => {
    const waiting = waitForControlResponse('req-1', 30_000);
    cancelControlResponse('req-1');
    settleControlResponse(successEvent('req-1', 'late'));
    await expect(waiting).rejects.toThrow(/cancelled/);
  });

  it('mints ids that differ even when minted back to back', () => {
    // Time-based ids would collide inside one millisecond, and a collision here
    // resolves the wrong caller with the wrong payload.
    const ids = [
      nextControlRequestId('mcp_status'),
      nextControlRequestId('mcp_status'),
      nextControlRequestId('mcp_status'),
    ];
    expect(new Set(ids).size).toBe(3);
  });
});
