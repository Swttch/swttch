/**
 * A denial answers a CLI that is blocked waiting for it, so the message must
 * always be sendable. A caller once wired deny() to a click handler and React
 * passed its MouseEvent as the reason; JSON.stringify threw on the circular
 * DOM node, the message never left the webview, and the turn hung with the IDE
 * diff still open. Types permit that mistake, so the guard is pinned here.
 */
import { describe, it, expect, vi } from 'vitest';
import { ToolsApi } from '../ToolsApi';
import { MessageType } from '@/shared';

function apiWithSpy() {
  const request = vi.fn().mockResolvedValue(undefined);
  return { request, api: new ToolsApi({ request } as never) };
}

describe('ToolsApi.deny', () => {
  it('sends a denial with no reason field when none is given', async () => {
    const { request, api } = apiWithSpy();
    await api.deny('toolu_1', 'ctrl-1');
    expect(request).toHaveBeenCalledWith(MessageType.TOOL_RESPONSE, {
      toolUseId: 'toolu_1',
      approved: false,
      controlRequestId: 'ctrl-1',
    });
  });

  it('passes a typed reason through', async () => {
    const { request, api } = apiWithSpy();
    await api.deny('toolu_1', 'ctrl-1', 'not this file');
    expect(request.mock.calls[0][1]).toMatchObject({ reason: 'not this file' });
  });

  it('drops a non-string reason rather than failing to send', async () => {
    const { request, api } = apiWithSpy();
    // What a click handler passes: an object that cannot be serialised.
    const event = { type: 'click' } as never;
    (event as unknown as Record<string, unknown>).self = event;

    await api.deny('toolu_1', 'ctrl-1', event);

    const payload = request.mock.calls[0][1];
    expect(payload).not.toHaveProperty('reason');
    // The whole point: the payload still survives the trip to the backend.
    expect(() => JSON.stringify(payload)).not.toThrow();
  });
});
