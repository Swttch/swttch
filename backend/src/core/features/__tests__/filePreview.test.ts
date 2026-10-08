import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { MAX_IMAGE_BYTES, MAX_VIDEO_BYTES, readFilePreview } from '../filePreview';

let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'ccg-preview-test-'));
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function fileWith(name: string, content: string | Buffer): Promise<string> {
  const path = join(dir, name);
  await writeFile(path, content);
  return path;
}

describe('readFilePreview', () => {
  it('returns the first lines of a text file, as a card shows them', async () => {
    const path = await fileWith('plan.md', '# Plan\n\nstep one\nstep two\n');
    expect(await readFilePreview(path)).toEqual({ kind: 'text', text: '# Plan\n\nstep one\nstep two' });
  });

  it('stops after twelve lines and cuts each line short', async () => {
    const lines = Array.from({ length: 30 }, (_, i) => `line ${i} ` + 'x'.repeat(100));
    const preview = await readFilePreview(await fileWith('long.txt', lines.join('\n')));

    expect(preview.kind).toBe('text');
    const shown = (preview as { text: string }).text.split('\n');
    expect(shown).toHaveLength(12);
    expect(shown.every((line) => line.length <= 40)).toBe(true);
  });

  it('reads a file with no extension when it is text', async () => {
    expect(await readFilePreview(await fileWith('Makefile', 'all:\n\techo hi\n'))).toMatchObject({ kind: 'text' });
  });

  it('keeps Korean text readable', async () => {
    const preview = await readFilePreview(await fileWith('memo.txt', '안녕하세요\n두 번째 줄'));
    expect(preview).toEqual({ kind: 'text', text: '안녕하세요\n두 번째 줄' });
  });

  it('has nothing to show for binary content, whatever the name says', async () => {
    const path = await fileWith('mystery.dat', Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x01]));
    expect(await readFilePreview(path)).toEqual({ kind: 'none' });
  });

  it('skips formats that would decode into noise without reading them', async () => {
    expect(await readFilePreview(await fileWith('doc.pdf', '%PDF-1.4 looks like text'))).toEqual({ kind: 'none' });
    expect(await readFilePreview(await fileWith('bundle.zip', 'PK looks like text'))).toEqual({ kind: 'none' });
  });

  it('returns a picture the browser can draw, as base64 with its type', async () => {
    const preview = await readFilePreview(await fileWith('logo.svg', '<svg xmlns="http://www.w3.org/2000/svg"/>'));
    expect(preview).toEqual({
      kind: 'image',
      mimeType: 'image/svg+xml',
      base64: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>').toString('base64'),
    });
  });

  it('shows a png that was attached by path rather than inline', async () => {
    expect(await readFilePreview(await fileWith('shot.PNG', Buffer.from([1, 2, 3])))).toMatchObject({
      kind: 'image',
      mimeType: 'image/png',
    });
  });

  it('leaves a picture over the limit on its icon', async () => {
    const path = await fileWith('huge.png', Buffer.alloc(MAX_IMAGE_BYTES + 1));
    expect(await readFilePreview(path)).toEqual({ kind: 'none' });
  });

  it('hands over a video for the webview to take a frame from', async () => {
    expect(await readFilePreview(await fileWith('clip.mov', Buffer.from([0, 0, 0, 20])))).toMatchObject({
      kind: 'video',
      mimeType: 'video/quicktime',
    });
  });

  it('leaves a video over the limit on its icon', async () => {
    const path = await fileWith('big.mp4', Buffer.alloc(MAX_VIDEO_BYTES + 1));
    expect(await readFilePreview(path)).toEqual({ kind: 'none' });
  });

  it('has nothing to show for an empty file, a folder, or a path that is gone', async () => {
    expect(await readFilePreview(await fileWith('empty.txt', ''))).toEqual({ kind: 'none' });
    const folder = join(dir, 'a-folder');
    await mkdir(folder);
    expect(await readFilePreview(folder)).toEqual({ kind: 'none' });
    expect(await readFilePreview(join(dir, 'nope.txt'))).toEqual({ kind: 'none' });
  });
});
