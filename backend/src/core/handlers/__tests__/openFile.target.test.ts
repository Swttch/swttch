import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { openFileHandler } from '../openFile';
import { revealFileHandler } from '../fileActions';
import { ConnectionManager } from '../../../ws/connection-manager';
import { ClientEnv, MessageType } from '../../../shared';
import type { Bridge } from '../../../bridge/bridge-interface';
import type { IPCMessage } from '../../types';

/** What a click asks for reaches the editor as a file that exists and a place in it (#708). */
describe('a clicked reference, from the request to the bridge', () => {
  let root: string;
  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'ccg-open-'));
    writeFileSync(join(root, 'README.md'), '# Title\n\n## 3. 数据中心专题索引\n');
  });
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  const send = async (type: MessageType, payload: Record<string, unknown>) => {
    const connections = new ConnectionManager();
    const sent: string[] = [];
    const bridge = { openFile: vi.fn(), revealFile: vi.fn() } as unknown as Bridge;
    const bridges = { [ClientEnv.BROWSER]: bridge, [ClientEnv.JETBRAINS]: bridge };
    const connectionId = connections.addConnection(
      { readyState: 1, send: vi.fn((data: string) => sent.push(data)), on: vi.fn(), close: vi.fn() } as never,
      ClientEnv.BROWSER,
    );
    const message = { type, payload, requestId: 'r' } as IPCMessage;
    const handler = type === MessageType.OPEN_FILE ? openFileHandler : revealFileHandler;
    await handler(connectionId, message, connections, bridge, bridges);
    return { bridge, ack: JSON.parse(sent[sent.length - 1]).payload };
  };

  it('opens a heading link at the heading', async () => {
    const { bridge, ack } = await send(MessageType.OPEN_FILE, {
      filePath: `${root}/README.md#3-数据中心专题索引`,
      workingDir: root,
    });
    expect(bridge.openFile).toHaveBeenCalledWith(join(root, 'README.md'), 3, undefined, root);
    expect(ack).toMatchObject({ ok: true });
  });

  it('keeps the line the click named over the one in the path', async () => {
    const { bridge } = await send(MessageType.OPEN_FILE, { filePath: `${root}/README.md:2`, line: 1, workingDir: root });
    expect(bridge.openFile).toHaveBeenCalledWith(join(root, 'README.md'), 1, undefined, root);
  });

  it('reveals a project-relative path in its project', async () => {
    const { bridge, ack } = await send(MessageType.REVEAL_FILE, { filePath: 'README.md', workingDir: root });
    expect(bridge.revealFile).toHaveBeenCalledWith(join(root, 'README.md'));
    expect(ack).toMatchObject({ ok: true });
  });

  it('still reports a file that is not there', async () => {
    const { bridge, ack } = await send(MessageType.OPEN_FILE, { filePath: `${root}/missing.md#x`, workingDir: root });
    expect(bridge.openFile).not.toHaveBeenCalled();
    expect(ack).toMatchObject({ ok: false, reason: 'not-found' });
  });
});
