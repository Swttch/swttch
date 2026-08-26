/**
 * Reopening the review diff from the approval prompt.
 *
 * The diff can be closed while its question is still on screen — Escape with
 * the diff focused does exactly that — leaving the prompt naming a file with no
 * way to see the change again. The file name in the prompt is a link, and this
 * is what it asks for.
 *
 * The webview sends only the tool_use_id: the contents live backend-side (see
 * diffPreview), so a reopen shows the text we diffed rather than something
 * reassembled from what the browser rendered.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

/*
 * Stubbed so these tests do not read the developer's own settings file. The
 * handler now merges settings to decide which surface a review opens on, and
 * without this a machine whose global `diffSurface` is "built-in" would send
 * every case down the built-in path and fail here for a reason that has
 * nothing to do with reopening a diff.
 */
const mergedSettings = vi.fn(async () => ({ settings: {} as Record<string, unknown>, overrides: [] }));
vi.mock('../../features/settings', () => ({
  readMergedSettings: (...args: unknown[]) => mergedSettings(...(args as [])),
}));

import { openDiffHandler } from '../openDiff';
import { rememberPreview, clearPreviews, takePreview } from '../../features/diffPreview';
import { MessageType } from '../../../shared';

function fakeConnections(workingDir = '/tmp') {
  const sent: { type: string; payload: Record<string, unknown> }[] = [];
  return {
    sent,
    sendTo: (_id: string, type: string, payload: Record<string, unknown>) => {
      sent.push({ type, payload });
    },
    // The handler asks the review's own session where it lives, so a project's
    // setting is merged for the project the review is in (#359).
    getSession: () => ({ workingDir }),
  };
}

function fakeBridge() {
  const opened: Record<string, unknown>[] = [];
  return {
    opened,
    openDiff: vi.fn(async (p: Record<string, unknown>) => { opened.push(p); }),
    openDiffTab: vi.fn(async () => undefined),
    // An attached IDE is what makes the IDE viewer available at all; without
    // this the handler correctly falls back to the built-in surface.
    isConnected: () => true,
  };
}

const preview = {
  filePath: '/tmp/cart.js',
  oldContent: 'before\n',
  newContent: 'after\n',
  hunks: [],
  input: { file_path: '/tmp/cart.js', content: 'after\n' },
  toolName: 'Write',
};

beforeEach(() => clearPreviews());

describe('openDiffHandler — reopening a pending review diff', () => {
  it('opens the stored preview when given only a tool_use_id', () => {
    const connections = fakeConnections();
    const bridge = fakeBridge();
    rememberPreview('toolu_1', preview);

    return openDiffHandler(
      'conn-1',
      { type: MessageType.OPEN_DIFF, requestId: 'r1', payload: { toolUseId: 'toolu_1' } } as never,
      connections as never,
      bridge as never,
    ).then(() => {
      expect(bridge.opened).toHaveLength(1);
      expect(bridge.opened[0]).toMatchObject({
        filePath: '/tmp/cart.js',
        oldContent: 'before\n',
        newContent: 'after\n',
        toolUseId: 'toolu_1',
      });
    });
  });

  it('leaves the preview in place so the answer can still use it', async () => {
    // The question is still open after a reopen — consuming the preview here
    // would strand the eventual approval with nothing to write.
    const bridge = fakeBridge();
    rememberPreview('toolu_1', preview);

    await openDiffHandler(
      'conn-1',
      { type: MessageType.OPEN_DIFF, requestId: 'r1', payload: { toolUseId: 'toolu_1' } } as never,
      fakeConnections() as never,
      bridge as never,
    );

    expect(takePreview('toolu_1')).toBeDefined();
  });

  it('acknowledges an id it has no preview for rather than failing', async () => {
    // The request was already answered, so its preview is gone. Nothing to
    // show, and nothing worth reporting as an error.
    const connections = fakeConnections();
    const bridge = fakeBridge();

    await openDiffHandler(
      'conn-1',
      { type: MessageType.OPEN_DIFF, requestId: 'r1', payload: { toolUseId: 'gone' } } as never,
      connections as never,
      bridge as never,
    );

    expect(bridge.openDiff).not.toHaveBeenCalled();
    expect(connections.sent.at(-1)?.payload.status).toBe('ok');
  });

  it('still opens contents passed in directly', async () => {
    // The original caller hands over the file contents itself; that path keeps
    // working alongside the id-only one.
    const bridge = fakeBridge();

    await openDiffHandler(
      'conn-1',
      {
        type: MessageType.OPEN_DIFF,
        requestId: 'r1',
        payload: { filePath: '/tmp/a.ts', oldContent: 'x', newContent: 'y' },
      } as never,
      fakeConnections() as never,
      bridge as never,
    );

    expect(bridge.opened[0]).toMatchObject({ filePath: '/tmp/a.ts', oldContent: 'x', newContent: 'y' });
  });
});
