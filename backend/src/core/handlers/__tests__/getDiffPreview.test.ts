/**
 * Handing the webview the change behind a pending permission request, so it can
 * draw the review diff itself.
 *
 * This is the only way to see a proposed edit outside an IDE:
 * `BrowserBridge.openDiff` is a no-op, so in a browser the approval prompt
 * could name the file but never show what was in it.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { getDiffPreviewHandler } from '../getDiffPreview';
import { rememberPreview, clearPreviews, peekPreview } from '../../features/diffPreview';
import { MessageType } from '../../../shared';

function fakeConnections() {
  const sent: { type: string; payload: Record<string, unknown> }[] = [];
  return {
    sent,
    sendTo: (_id: string, type: string, payload: Record<string, unknown>) => {
      sent.push({ type, payload });
    },
  };
}

const preview = {
  filePath: '/tmp/cart.js',
  oldContent: 'before\n',
  newContent: 'after\n',
  hunks: [],
  input: { file_path: '/tmp/cart.js', content: 'after\n' },
  toolName: 'Write',
  sessionId: 'sess-1',
  controlRequestId: 'ctrl-1',
};

beforeEach(() => clearPreviews());

describe('getDiffPreviewHandler', () => {
  it('answers with the stored change for a pending request', async () => {
    const connections = fakeConnections();
    rememberPreview('toolu_1', preview);

    await getDiffPreviewHandler(
      'conn-1',
      { type: MessageType.GET_DIFF_PREVIEW, requestId: 'r1', payload: { toolUseId: 'toolu_1' } } as never,
      connections as never,
    );

    expect(connections.sent[0].type).toBe(MessageType.ACK);
    expect(connections.sent[0].payload.requestId).toBe('r1');
    expect(connections.sent[0].payload.preview).toEqual(preview);
  });

  it('sends the preview whole rather than a trimmed copy', () => {
    // The original-data rule: the webview gets the structure the backend holds,
    // not "the fields today's UI happens to use". A future reviewer reading the
    // wire should see what Claude proposed, unedited.
    const connections = fakeConnections();
    rememberPreview('toolu_whole', preview);

    return getDiffPreviewHandler(
      'conn-1',
      { type: MessageType.GET_DIFF_PREVIEW, requestId: 'r1', payload: { toolUseId: 'toolu_whole' } } as never,
      connections as never,
    ).then(() => {
      const sent = connections.sent[0].payload.preview as Record<string, unknown>;
      for (const key of Object.keys(preview)) {
        expect(Object.keys(sent), `missing ${key}`).toContain(key);
      }
    });
  });

  it('leaves the preview in place for the answer that follows', async () => {
    // Peeked, not consumed: the question is still open, and resolving it needs
    // this entry to know what to write.
    const connections = fakeConnections();
    rememberPreview('toolu_2', preview);

    await getDiffPreviewHandler(
      'conn-1',
      { type: MessageType.GET_DIFF_PREVIEW, requestId: 'r1', payload: { toolUseId: 'toolu_2' } } as never,
      connections as never,
    );

    expect(peekPreview('toolu_2')).toBeDefined();
  });

  it('answers null for a request that was already settled', async () => {
    // Not an error: the fetch just lost a race with the decision, and the
    // caller draws nothing.
    const connections = fakeConnections();

    await getDiffPreviewHandler(
      'conn-1',
      { type: MessageType.GET_DIFF_PREVIEW, requestId: 'r1', payload: { toolUseId: 'gone' } } as never,
      connections as never,
    );

    expect(connections.sent[0].type).toBe(MessageType.ACK);
    expect(connections.sent[0].payload.preview).toBeNull();
  });

  it('answers null when no tool_use_id was named', async () => {
    const connections = fakeConnections();

    await getDiffPreviewHandler(
      'conn-1',
      { type: MessageType.GET_DIFF_PREVIEW, requestId: 'r1', payload: {} } as never,
      connections as never,
    );

    expect(connections.sent[0].payload.preview).toBeNull();
  });
});
