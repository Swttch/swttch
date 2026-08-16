import { describe, it, expect, vi } from 'vitest';
import { handleIdeSelectionRequest } from '../ide-selection-route';
import { ConnectionManager } from '../connection-manager';
import { ClientEnv, MessageType } from '../../shared';

function createMockWs(readyState = 1) {
  return {
    readyState,
    send: vi.fn(),
    close: vi.fn(),
  } as unknown as import('ws').WebSocket;
}

describe('handleIdeSelectionRequest', () => {
  it('returns 400 when the body is not valid JSON', () => {
    const cm = new ConnectionManager();
    const result = handleIdeSelectionRequest(cm, 'not json{');
    expect(result.status).toBe(400);
    expect(result.body).toHaveProperty('error');
  });

  it('returns 400 when absolutePath is missing', () => {
    const cm = new ConnectionManager();
    const result = handleIdeSelectionRequest(
      cm,
      JSON.stringify({ relativePath: 'src/file.ts', workingDir: '/abs' }),
    );
    expect(result.status).toBe(400);
  });

  it('returns 400 when relativePath is missing', () => {
    const cm = new ConnectionManager();
    const result = handleIdeSelectionRequest(
      cm,
      JSON.stringify({ absolutePath: '/abs/src/file.ts', workingDir: '/abs' }),
    );
    expect(result.status).toBe(400);
  });

  it('returns 400 when absolutePath is not a string', () => {
    const cm = new ConnectionManager();
    const result = handleIdeSelectionRequest(
      cm,
      JSON.stringify({ absolutePath: 42, relativePath: 'src/file.ts', workingDir: '/abs' }),
    );
    expect(result.status).toBe(400);
  });

  it('broadcasts IDE_SELECTION with selectedText when there is at least one connection', () => {
    const cm = new ConnectionManager();
    const ws = createMockWs();
    cm.addConnection(ws);

    const body = JSON.stringify({
      absolutePath: '/abs/src/file.ts',
      relativePath: 'src/file.ts',
      startLine: 10,
      endLine: 25,
      selectedText: 'const x = 1;',
      workingDir: '/abs',
      isGitignored: false,
    });
    const result = handleIdeSelectionRequest(cm, body);

    expect(result.status).toBe(200);
    expect(result.body).toEqual({ success: true });
    expect(ws.send).toHaveBeenCalledTimes(1);
    const sent = JSON.parse((ws.send as ReturnType<typeof vi.fn>).mock.calls[0][0]);
    expect(sent.type).toBe(MessageType.IDE_SELECTION);
    expect(sent.payload).toEqual({
      absolutePath: '/abs/src/file.ts',
      relativePath: 'src/file.ts',
      startLine: 10,
      endLine: 25,
      selectedText: 'const x = 1;',
      workingDir: '/abs',
      isGitignored: false,
    });
  });

  it('routes IDE_SELECTION only to the last-focused panel when it is live', () => {
    const cm = new ConnectionManager();
    const wsFocused = createMockWs();
    cm.addConnection(wsFocused, ClientEnv.BROWSER, 'panel-1');
    const wsOther = createMockWs();
    cm.addConnection(wsOther, ClientEnv.BROWSER, 'panel-2');
    cm.setLastFocusedPanelId('panel-1');

    const body = JSON.stringify({
      absolutePath: '/abs/src/file.ts',
      relativePath: 'src/file.ts',
      startLine: 10,
      endLine: 25,
      selectedText: 'const x = 1;',
      workingDir: '/abs',
      isGitignored: false,
    });
    const result = handleIdeSelectionRequest(cm, body);

    expect(result.status).toBe(200);
    expect(wsFocused.send).toHaveBeenCalledTimes(1);
    expect(wsOther.send).not.toHaveBeenCalled();
    const sent = JSON.parse((wsFocused.send as ReturnType<typeof vi.fn>).mock.calls[0][0]);
    expect(sent.type).toBe(MessageType.IDE_SELECTION);
    expect(sent.payload.absolutePath).toBe('/abs/src/file.ts');
  });

  it('falls back to broadcasting IDE_SELECTION when the focused panel is not live', () => {
    const cm = new ConnectionManager();
    const ws1 = createMockWs();
    cm.addConnection(ws1, ClientEnv.BROWSER, 'panel-1');
    const ws2 = createMockWs();
    cm.addConnection(ws2, ClientEnv.BROWSER, 'panel-2');
    cm.setLastFocusedPanelId('ghost-panel');

    const body = JSON.stringify({
      absolutePath: '/abs/src/file.ts',
      relativePath: 'src/file.ts',
      startLine: null,
      endLine: null,
      selectedText: null,
      workingDir: '/abs',
    });
    handleIdeSelectionRequest(cm, body);

    expect(ws1.send).toHaveBeenCalledTimes(1);
    expect(ws2.send).toHaveBeenCalledTimes(1);
  });

  it('broadcasts IDE_SELECTION with isGitignored: true when the file is VCS-ignored', () => {
    const cm = new ConnectionManager();
    const ws = createMockWs();
    cm.addConnection(ws);

    const body = JSON.stringify({
      absolutePath: '/abs/dist/bundle.js',
      relativePath: 'dist/bundle.js',
      startLine: null,
      endLine: null,
      selectedText: null,
      workingDir: '/abs',
      isGitignored: true,
    });
    const result = handleIdeSelectionRequest(cm, body);

    expect(result.status).toBe(200);
    const sent = JSON.parse((ws.send as ReturnType<typeof vi.fn>).mock.calls[0][0]);
    expect(sent.payload.isGitignored).toBe(true);
  });

  it('normalizes missing isGitignored to false', () => {
    const cm = new ConnectionManager();
    const ws = createMockWs();
    cm.addConnection(ws);

    // Kotlin did not send the field (e.g. older plugin version)
    const body = JSON.stringify({
      absolutePath: '/abs/src/file.ts',
      relativePath: 'src/file.ts',
      startLine: null,
      endLine: null,
      selectedText: null,
      workingDir: '/abs',
      // isGitignored intentionally omitted
    });
    handleIdeSelectionRequest(cm, body);

    const sent = JSON.parse((ws.send as ReturnType<typeof vi.fn>).mock.calls[0][0]);
    expect(sent.payload.isGitignored).toBe(false);
  });

  it('normalizes non-boolean isGitignored to false', () => {
    const cm = new ConnectionManager();
    const ws = createMockWs();
    cm.addConnection(ws);

    const body = JSON.stringify({
      absolutePath: '/abs/src/file.ts',
      relativePath: 'src/file.ts',
      startLine: null,
      endLine: null,
      selectedText: null,
      workingDir: '/abs',
      isGitignored: 1, // number instead of boolean
    });
    handleIdeSelectionRequest(cm, body);

    const sent = JSON.parse((ws.send as ReturnType<typeof vi.fn>).mock.calls[0][0]);
    expect(sent.payload.isGitignored).toBe(false);
  });

  it('broadcasts IDE_SELECTION with null fields when no selection is present', () => {
    const cm = new ConnectionManager();
    const ws = createMockWs();
    cm.addConnection(ws);

    const body = JSON.stringify({
      absolutePath: '/abs/src/file.ts',
      relativePath: 'src/file.ts',
      startLine: null,
      endLine: null,
      selectedText: null,
      workingDir: '/abs',
    });
    const result = handleIdeSelectionRequest(cm, body);

    expect(result.status).toBe(200);
    const sent = JSON.parse((ws.send as ReturnType<typeof vi.fn>).mock.calls[0][0]);
    expect(sent.payload.startLine).toBeNull();
    expect(sent.payload.endLine).toBeNull();
    expect(sent.payload.selectedText).toBeNull();
  });

  it('does NOT broadcast when there are no connections, but stores the last selection for replay', () => {
    const cm = new ConnectionManager();
    const broadcastSpy = vi.spyOn(cm, 'broadcastToAll');
    // ide-selection must NOT touch the one-shot editor-context buffer...
    const setPendingSpy = vi.spyOn(cm, 'setPendingEditorContext');
    // ...it uses its own persistent last-selection buffer instead.
    const setLastSpy = vi.spyOn(cm, 'setLastIdeSelection');

    const body = JSON.stringify({
      absolutePath: '/abs/src/file.ts',
      relativePath: 'src/file.ts',
      startLine: 5,
      endLine: 10,
      selectedText: 'hello',
      workingDir: '/abs',
    });
    const result = handleIdeSelectionRequest(cm, body);

    expect(result.status).toBe(200);
    expect(result.body).toEqual({ success: true });
    expect(broadcastSpy).not.toHaveBeenCalled();
    expect(setPendingSpy).not.toHaveBeenCalled();
    expect(setLastSpy).toHaveBeenCalledTimes(1);
  });

  it('stores the last IDE_SELECTION and replays it to a webview that connects afterward', () => {
    const cm = new ConnectionManager();

    const body = JSON.stringify({
      absolutePath: '/abs/src/file.ts',
      relativePath: 'src/file.ts',
      startLine: 10,
      endLine: 25,
      selectedText: 'const x = 1;',
      workingDir: '/abs',
      isGitignored: false,
    });
    // No webview connected yet (e.g. tool window closed).
    handleIdeSelectionRequest(cm, body);

    // Webview (re)connects — should immediately receive the last selection.
    const ws = createMockWs();
    cm.addConnection(ws);

    expect(ws.send).toHaveBeenCalledTimes(1);
    const sent = JSON.parse((ws.send as ReturnType<typeof vi.fn>).mock.calls[0][0]);
    expect(sent.type).toBe(MessageType.IDE_SELECTION);
    expect(sent.payload).toEqual({
      absolutePath: '/abs/src/file.ts',
      relativePath: 'src/file.ts',
      startLine: 10,
      endLine: 25,
      selectedText: 'const x = 1;',
      workingDir: '/abs',
      isGitignored: false,
    });
  });

  it('replays the last IDE_SELECTION to every new connection (persists, not consumed once)', () => {
    const cm = new ConnectionManager();

    const body = JSON.stringify({
      absolutePath: '/abs/src/file.ts',
      relativePath: 'src/file.ts',
      startLine: 1,
      endLine: 2,
      selectedText: null,
      workingDir: '/abs',
    });
    handleIdeSelectionRequest(cm, body);

    const ws1 = createMockWs();
    cm.addConnection(ws1);
    const ws2 = createMockWs();
    cm.addConnection(ws2);

    expect(ws1.send).toHaveBeenCalledTimes(1);
    expect(ws2.send).toHaveBeenCalledTimes(1);
  });

  it('restores the last selection on tool-window reopen (broadcast while connected, replay after reconnect)', () => {
    const cm = new ConnectionManager();
    const ws1 = createMockWs();
    const conn1 = cm.addConnection(ws1);

    const body = JSON.stringify({
      absolutePath: '/abs/src/file.ts',
      relativePath: 'src/file.ts',
      startLine: 3,
      endLine: 4,
      selectedText: 'sel',
      workingDir: '/abs',
    });
    // While the webview is connected, the selection is broadcast live.
    handleIdeSelectionRequest(cm, body);
    expect(ws1.send).toHaveBeenCalledTimes(1);

    // Tool window closed → webview disconnects.
    cm.removeConnection(conn1);

    // Tool window reopened → fresh webview connects, same file still focused
    // (no new IDE event). The stored last selection is replayed immediately.
    const ws2 = createMockWs();
    cm.addConnection(ws2);
    expect(ws2.send).toHaveBeenCalledTimes(1);
    const sent = JSON.parse((ws2.send as ReturnType<typeof vi.fn>).mock.calls[0][0]);
    expect(sent.type).toBe(MessageType.IDE_SELECTION);
    expect(sent.payload.absolutePath).toBe('/abs/src/file.ts');
  });

  it('normalizes non-number startLine/endLine to null', () => {
    const cm = new ConnectionManager();
    const ws = createMockWs();
    cm.addConnection(ws);

    const body = JSON.stringify({
      absolutePath: '/abs/src/file.ts',
      relativePath: 'src/file.ts',
      startLine: 'bad',
      endLine: undefined,
      selectedText: null,
      workingDir: '/abs',
    });
    handleIdeSelectionRequest(cm, body);

    const sent = JSON.parse((ws.send as ReturnType<typeof vi.fn>).mock.calls[0][0]);
    expect(sent.payload.startLine).toBeNull();
    expect(sent.payload.endLine).toBeNull();
  });

  it('normalizes non-string selectedText to null', () => {
    const cm = new ConnectionManager();
    const ws = createMockWs();
    cm.addConnection(ws);

    const body = JSON.stringify({
      absolutePath: '/abs/src/file.ts',
      relativePath: 'src/file.ts',
      startLine: 1,
      endLine: 2,
      selectedText: 99,
      workingDir: '/abs',
    });
    handleIdeSelectionRequest(cm, body);

    const sent = JSON.parse((ws.send as ReturnType<typeof vi.fn>).mock.calls[0][0]);
    expect(sent.payload.selectedText).toBeNull();
  });

  it('accepts empty paths as the IDE saying nothing is open', () => {
    // Closing the last tab has to be expressible. The webview turns this into
    // an empty context chip; rejecting it as a bad request would leave the chip
    // naming a file the user already closed.
    const cm = new ConnectionManager();
    const ws = createMockWs();
    cm.addConnection(ws, ClientEnv.BROWSER, 'panel-1');

    const result = handleIdeSelectionRequest(
      cm,
      JSON.stringify({ absolutePath: '', relativePath: '', workingDir: '/abs' }),
    );

    expect(result.status).toBe(200);
    const sent = JSON.parse((ws.send as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0]);
    expect(sent.type).toBe(MessageType.IDE_SELECTION);
    expect(sent.payload).toMatchObject({ absolutePath: '', relativePath: '', workingDir: '/abs' });
  });
});
