import { describe, it, expect, vi, beforeEach } from 'vitest';
import { existsSync } from 'fs';
import { openFileWithSystemAppHandler, revealFileHandler } from '../fileActions';
import { ConnectionManager } from '../../../ws/connection-manager';
import { ClientEnv, MessageType } from '../../../shared';
import type { Bridge } from '../../../bridge/bridge-interface';
import type { IPCMessage } from '../../types';

vi.mock('fs', () => ({ existsSync: vi.fn(() => true) }));
const mockExistsSync = vi.mocked(existsSync);

function createMockWs() {
  return { readyState: 1, send: vi.fn(), on: vi.fn(), close: vi.fn() } as any;
}

function createBridge(overrides: Partial<Bridge> = {}): Bridge {
  return {
    openFileWithSystemApp: vi.fn().mockResolvedValue(undefined),
    revealFile: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as any;
}

function message(type: MessageType, filePath: unknown): IPCMessage {
  return { type, payload: { filePath }, requestId: 'req-1' } as any;
}

describe('file actions from the file link menu (#567)', () => {
  let connections: ConnectionManager;
  let ws: ReturnType<typeof createMockWs>;
  let connId: string;

  beforeEach(() => {
    mockExistsSync.mockReturnValue(true);
    connections = new ConnectionManager();
    ws = createMockWs();
    connId = connections.addConnection(ws, ClientEnv.BROWSER);
  });

  const bridgesOf = (browser: Bridge, jetbrains: Bridge = createBridge()) => ({
    [ClientEnv.BROWSER]: browser,
    [ClientEnv.JETBRAINS]: jetbrains,
  });
  const ack = () => String(ws.send.mock.calls[0][0]);

  it('opens a file with the system app and acks ok', async () => {
    const browser = createBridge();
    await openFileWithSystemAppHandler(connId, message(MessageType.OPEN_FILE_WITH_SYSTEM_APP, '/abs/x.png'), connections, browser, bridgesOf(browser));
    expect(browser.openFileWithSystemApp).toHaveBeenCalledWith('/abs/x.png');
    expect(ack()).toContain('"ok":true');
  });

  it('reveals a file in the file manager and acks ok', async () => {
    const browser = createBridge();
    await revealFileHandler(connId, message(MessageType.REVEAL_FILE, '/abs/x.png'), connections, browser, bridgesOf(browser));
    expect(browser.revealFile).toHaveBeenCalledWith('/abs/x.png');
    expect(ack()).toContain('"ok":true');
  });

  it('acks not-found without calling the bridge when the file is missing', async () => {
    mockExistsSync.mockReturnValue(false);
    const browser = createBridge();
    await revealFileHandler(connId, message(MessageType.REVEAL_FILE, '/abs/gone.png'), connections, browser, bridgesOf(browser));
    expect(browser.revealFile).not.toHaveBeenCalled();
    expect(ack()).toContain('not-found');
    expect(ack()).toContain('"ok":false');
  });

  it('acks open-failed when the bridge rejects', async () => {
    const browser = createBridge({ openFileWithSystemApp: vi.fn().mockRejectedValue(new Error('no app')) });
    await openFileWithSystemAppHandler(connId, message(MessageType.OPEN_FILE_WITH_SYSTEM_APP, '/abs/x.png'), connections, browser, bridgesOf(browser));
    expect(ack()).toContain('open-failed');
  });

  it('acks no-path for a request without a path', async () => {
    const browser = createBridge();
    await revealFileHandler(connId, message(MessageType.REVEAL_FILE, undefined), connections, browser, bridgesOf(browser));
    expect(browser.revealFile).not.toHaveBeenCalled();
    expect(ack()).toContain('no-path');
  });

  it('sends a browser client to the IDE when one is attached, like an open does', async () => {
    const browser = createBridge();
    const jetbrains = createBridge({ isConnected: vi.fn().mockReturnValue(true) } as any);
    await revealFileHandler(connId, message(MessageType.REVEAL_FILE, '/abs/x.png'), connections, browser, bridgesOf(browser, jetbrains));
    expect(jetbrains.revealFile).toHaveBeenCalledWith('/abs/x.png');
    expect(browser.revealFile).not.toHaveBeenCalled();
  });
});
