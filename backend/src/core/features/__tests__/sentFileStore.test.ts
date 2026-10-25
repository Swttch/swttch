import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { keepSentFile, resolveSentFilePath, sentFileCopyPath, sentFilePathsOf, SENT_FILE_MAX_BYTES } from '../sentFileStore';
import { readFileBytesChunk } from '../fileBytes';
import { readFilePreview } from '../filePreview';

let dir: string;
let previousHome: string | undefined;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'ccg-sent-'));
  previousHome = process.env.CCG_HOME;
  process.env.CCG_HOME = join(dir, 'home');
});

afterEach(async () => {
  if (previousHome === undefined) delete process.env.CCG_HOME;
  else process.env.CCG_HOME = previousHome;
  await rm(dir, { recursive: true, force: true });
});

describe('sentFilePathsOf', () => {
  it('reads the paths a SendUserFile result reports, and nothing from other events', () => {
    const event = { type: 'user', tool_use_result: { attachments: [{ path: '/a/x.png' }, { path: '' }, { size: 3 }, { path: '/a/y.pdf' }] } };
    expect(sentFilePathsOf(event)).toEqual(['/a/x.png', '/a/y.pdf']);
    expect(sentFilePathsOf({ type: 'assistant', tool_use_result: event.tool_use_result })).toEqual([]);
    expect(sentFilePathsOf({ type: 'user' })).toEqual([]);
  });
});

describe('a kept copy of a sent file', () => {
  it('stands in for the original after it is deleted, for the preview and for the bytes', async () => {
    const original = join(dir, 'gone.png');
    await writeFile(original, Buffer.from('AAAA'));
    await keepSentFile(original);
    await rm(original);

    expect(await resolveSentFilePath(original)).toBe(sentFileCopyPath(original));
    expect(await readFilePreview(original, { sentFile: true })).toMatchObject({ kind: 'image', size: 4 });
    expect(await readFilePreview(original)).toEqual({ kind: 'none' });
    expect(await readFileBytesChunk(original, 0)).toMatchObject({ ok: true, size: 4, base64: Buffer.from('AAAA').toString('base64') });
  });

  it('keeps the original in use while it is there, and replaces its copy when it is sent again', async () => {
    const original = join(dir, 'p.png');
    await writeFile(original, 'one');
    await keepSentFile(original);
    await writeFile(original, 'two!');
    await keepSentFile(original);

    expect(await resolveSentFilePath(original)).toBe(original);
    expect(await readFile(sentFileCopyPath(original), 'utf-8')).toBe('two!');
  });

  it('does not keep a file larger than Desktop would upload, or one that is not a file', async () => {
    const big = join(dir, 'big.mp4');
    await writeFile(big, Buffer.alloc(SENT_FILE_MAX_BYTES + 1));
    await keepSentFile(big);
    await keepSentFile(dir);
    await rm(big);

    expect(await resolveSentFilePath(big)).toBe(big);
  });
});

describe('readFileBytesChunk', () => {
  it('answers a piece of any kind of file, from the offset', async () => {
    const path = join(dir, 'a.bin');
    await writeFile(path, Buffer.from([1, 2, 3, 4, 5]));
    const answer = await readFileBytesChunk(path, 2);
    expect(answer).toEqual({ ok: true, size: 5, offset: 2, base64: Buffer.from([3, 4, 5]).toString('base64') });
  });

  it('answers a reason, not an error, for a missing file', async () => {
    expect(await readFileBytesChunk(join(dir, 'nope'), 0)).toEqual({ ok: false, reason: 'unreadable' });
  });
});

describe('readFilePreview for a sent sound or large picture', () => {
  it('plays a sound only for a sent file, and reads a picture up to the sent-file limit', async () => {
    const wav = join(dir, 's.wav');
    await writeFile(wav, Buffer.from('RIFF'));
    expect(await readFilePreview(wav)).toMatchObject({ kind: 'none' });
    expect(await readFilePreview(wav, { sentFile: true })).toMatchObject({ kind: 'audio', mimeType: 'audio/wav' });

    const twelveMb = join(dir, 'big.png');
    await writeFile(twelveMb, Buffer.alloc(12 * 1024 * 1024));
    expect(await readFilePreview(twelveMb)).toMatchObject({ kind: 'none' });
    expect(await readFilePreview(twelveMb, { sentFile: true })).toMatchObject({ kind: 'image' });
  });
});
