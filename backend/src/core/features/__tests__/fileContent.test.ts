import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, writeFile, rm, mkdir, stat } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { contentTypeOf, readFileContentChunk, FILE_CONTENT_CHUNK_BYTES } from '../fileContent';

let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'file-content-'));
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('contentTypeOf', () => {
  it.each([
    ['a.html', 'html'],
    ['a.HTM', 'html'],
    ['doc.pdf', 'pdf'],
    ['pic.PNG', 'image'],
    ['pic.svg', 'image'],
    ['clip.mp4', 'video'],
    ['clip.mov', 'video'],
    ['clip.webm', 'video'],
  ])('%s is shown as %s', (path, kind) => {
    expect(contentTypeOf(path)?.kind).toBe(kind);
  });

  // Text is read as code (the web side decides which clicks open it; a path named in the chat still goes to the editor).
  it.each(['notes.txt', 'main.ts', 'data.csv', 'diagram.mmd'])('%s is shown as text', (path) => {
    expect(contentTypeOf(path)?.kind).toBe('text');
  });

  it.each(['archive.zip', 'deck.pptx', 'Makefile', 'photo.heic'])('%s is not shown in the pane', (path) => {
    expect(contentTypeOf(path)).toBeUndefined();
  });
});

describe('readFileContentChunk', () => {
  it('answers a small file whole, with its type and size', async () => {
    const path = join(dir, 'page.html');
    await writeFile(path, '<h1>hello</h1>');
    const answer = await readFileContentChunk(path, 0);
    expect(answer).toEqual({
      ok: true,
      kind: 'html',
      mimeType: 'text/html',
      size: 14,
      offset: 0,
      // When the file was written, so the pane can say how long ago.
      modifiedAt: (await stat(path)).mtimeMs,
      base64: Buffer.from('<h1>hello</h1>').toString('base64'),
    });
  });

  it('answers a large file in pieces that add up to the file', async () => {
    const path = join(dir, 'clip.mp4');
    const bytes = Buffer.alloc(FILE_CONTENT_CHUNK_BYTES * 2 + 100, 7);
    await writeFile(path, bytes);

    const pieces: Buffer[] = [];
    let offset = 0;
    for (;;) {
      const answer = await readFileContentChunk(path, offset);
      if (!answer.ok) throw new Error(`unexpected ${answer.reason}`);
      const piece = Buffer.from(answer.base64, 'base64');
      expect(answer.offset).toBe(offset);
      expect(piece.length).toBeLessThanOrEqual(FILE_CONTENT_CHUNK_BYTES);
      pieces.push(piece);
      offset += piece.length;
      if (offset >= answer.size) break;
    }
    expect(pieces).toHaveLength(3);
    expect(Buffer.concat(pieces).equals(bytes)).toBe(true);
  });

  it('answers an empty piece past the end of the file', async () => {
    const path = join(dir, 'tiny.png');
    await writeFile(path, 'x');
    const answer = await readFileContentChunk(path, 10);
    expect(answer).toMatchObject({ ok: true, size: 1, base64: '' });
  });

  it('refuses a file over the limit for its kind before sending any bytes', async () => {
    const path = join(dir, 'big.html');
    await writeFile(path, Buffer.alloc(5 * 1024 * 1024 + 1));
    expect(await readFileContentChunk(path, 0)).toEqual({
      ok: false,
      reason: 'tooLarge',
      size: 5 * 1024 * 1024 + 1,
      maxBytes: 5 * 1024 * 1024,
    });
  });

  it('says unsupported for a kind the pane does not show', async () => {
    const path = join(dir, 'deck.pptx');
    await writeFile(path, 'hi');
    expect(await readFileContentChunk(path, 0)).toEqual({ ok: false, reason: 'unsupported' });
  });

  it('answers a text file as text, and refuses a big one', async () => {
    const path = join(dir, 'data.csv');
    await writeFile(path, 'a,b\n1,2\n');
    const answer = await readFileContentChunk(path, 0);
    expect(answer).toMatchObject({ ok: true, kind: 'text', mimeType: 'text/plain', size: 8 });

    const big = join(dir, 'big.log');
    await writeFile(big, Buffer.alloc(2 * 1024 * 1024 + 1, 97));
    expect(await readFileContentChunk(big, 0)).toMatchObject({ ok: false, reason: 'tooLarge' });
  });

  it('says unreadable for a file that is gone and for a folder', async () => {
    expect(await readFileContentChunk(join(dir, 'gone.pdf'), 0)).toEqual({ ok: false, reason: 'unreadable' });
    const folder = join(dir, 'folder.html');
    await mkdir(folder);
    expect(await readFileContentChunk(folder, 0)).toEqual({ ok: false, reason: 'unreadable' });
  });

  it('treats a negative or non-numeric offset as the start', async () => {
    const path = join(dir, 'start.html');
    await writeFile(path, 'abc');
    expect(await readFileContentChunk(path, -5)).toMatchObject({ ok: true, offset: 0 });
    expect(await readFileContentChunk(path, Number.NaN)).toMatchObject({ ok: true, offset: 0 });
  });
});
