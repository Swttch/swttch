import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, readFile, rm, mkdir, utimes, readdir } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

import type { ConnectionManager } from '../../../ws/connection-manager';
import type { Bridge } from '../../../bridge/bridge-interface';
import type { IPCMessage } from '../../types';
import { MessageType } from '../../../shared';
import { uploadFileChunkHandler, sanitizeUploadFileName, uploadsBaseDir } from '../uploadFileChunk';

const UPLOAD_ID = '8f1c2d3e-4a5b-6c7d-8e9f-0a1b2c3d4e5f';

interface Ack {
  requestId?: string;
  status?: string;
  error?: string;
  path?: string;
}

let ccgHome: string;
let acks: Ack[];

const connections = {
  sendTo: (_id: string, _type: string, payload: Ack) => {
    acks.push(payload);
  },
} as unknown as ConnectionManager;
const bridge = {} as Bridge;

async function send(payload: Record<string, unknown>): Promise<Ack> {
  const message = { type: MessageType.UPLOAD_FILE_CHUNK, requestId: 'r1', payload, timestamp: 0 } as IPCMessage;
  await uploadFileChunkHandler('c1', message, connections, bridge);
  return acks[acks.length - 1];
}

const b64 = (text: string) => Buffer.from(text).toString('base64');

beforeEach(async () => {
  ccgHome = await mkdtemp(join(tmpdir(), 'ccg-upload-test-'));
  process.env.CCG_HOME = ccgHome;
  acks = [];
});

afterEach(async () => {
  delete process.env.CCG_HOME;
  await rm(ccgHome, { recursive: true, force: true });
});

describe('uploadFileChunkHandler', () => {
  it('writes the chunks in order and answers the last one with the saved path', async () => {
    const first = await send({ uploadId: UPLOAD_ID, fileName: 'a.mov', offset: 0, base64: b64('hello '), last: false });
    expect(first.path).toBeUndefined();

    const last = await send({ uploadId: UPLOAD_ID, fileName: 'a.mov', offset: 6, base64: b64('world'), last: true });
    expect(last.status).toBeUndefined();
    expect(last.path).toBe(join(uploadsBaseDir(), UPLOAD_ID, 'a.mov'));
    expect(await readFile(last.path as string, 'utf-8')).toBe('hello world');
  });

  it('keeps a Korean, space-bearing name and any extension exactly', async () => {
    const name = '화면 기록 2026-01-01 오후 1.02.03.mov';
    const ack = await send({ uploadId: UPLOAD_ID, fileName: name, offset: 0, base64: b64('x'), last: true });
    expect(ack.path).toBe(join(uploadsBaseDir(), UPLOAD_ID, name));
  });

  it('saves an empty file', async () => {
    const ack = await send({ uploadId: UPLOAD_ID, fileName: 'empty.bin', offset: 0, base64: '', last: true });
    expect(ack.path).toBeDefined();
    expect(await readFile(ack.path as string)).toHaveLength(0);
  });

  it('refuses a chunk that does not continue where the file ends', async () => {
    await send({ uploadId: UPLOAD_ID, fileName: 'a.txt', offset: 0, base64: b64('abc'), last: false });
    const skipped = await send({ uploadId: UPLOAD_ID, fileName: 'a.txt', offset: 10, base64: b64('zzz'), last: true });
    expect(skipped.status).toBe('error');
    expect(skipped.path).toBeUndefined();
  });

  it('refuses an upload id that could name a place outside the upload directory', async () => {
    const ack = await send({ uploadId: '../../escape', fileName: 'a.txt', offset: 0, base64: b64('x'), last: true });
    expect(ack.status).toBe('error');
  });

  it('never writes outside the upload directory, whatever the file name says', async () => {
    const ack = await send({ uploadId: UPLOAD_ID, fileName: '../../../evil.txt', offset: 0, base64: b64('x'), last: true });
    expect(ack.path).toBe(join(uploadsBaseDir(), UPLOAD_ID, 'evil.txt'));
  });

  it('removes copies older than a week when a new upload starts', async () => {
    const stale = join(uploadsBaseDir(), 'stale-upload-1234');
    await mkdir(stale, { recursive: true });
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    await utimes(stale, eightDaysAgo, eightDaysAgo);

    await send({ uploadId: UPLOAD_ID, fileName: 'a.txt', offset: 0, base64: b64('x'), last: true });
    // The prune is fire-and-forget; give its few file operations a moment.
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(await readdir(uploadsBaseDir())).toEqual([UPLOAD_ID]);
  });
});

describe('sanitizeUploadFileName', () => {
  it('keeps only the last path segment', () => {
    expect(sanitizeUploadFileName('a/b/c.txt')).toBe('c.txt');
    expect(sanitizeUploadFileName('C:\\Users\\me\\c.txt')).toBe('c.txt');
  });

  it('falls back when nothing usable is left', () => {
    expect(sanitizeUploadFileName('')).toBe('file');
    expect(sanitizeUploadFileName('..')).toBe('file');
    expect(sanitizeUploadFileName('\u0000\u0001')).toBe('file');
  });
});
