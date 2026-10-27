import { describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { saveImageHandler } from '../saveImage';

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);

function run(payload: Record<string, unknown>, saveFile: (o: { suggestedName: string; contents: string }) => Promise<{ path: string | null }>) {
  const sent: Array<Record<string, unknown>> = [];
  const connections = { sendTo: (_id: string, _type: string, body: Record<string, unknown>) => sent.push(body) };
  return saveImageHandler('c', { type: 'SAVE_IMAGE', requestId: 'r', payload } as never, connections as never, { saveFile } as never).then(() => sent[0]);
}

describe('saveImageHandler', () => {
  it('has the host name the file and writes the picture over it', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ccg-img-'));
    const target = join(dir, 'page.png');
    const saveFile = vi.fn(async () => ({ path: target }));
    const answer = await run({ suggestedName: 'page.png', base64: png.toString('base64') }, saveFile);
    expect(saveFile).toHaveBeenCalledWith({ suggestedName: 'page.png', contents: '' });
    expect(answer).toMatchObject({ requestId: 'r', path: target });
    expect(readFileSync(target).equals(png)).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });

  it('adds the extension the dialog dropped, and removes the empty file it made', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ccg-img-'));
    const bare = join(dir, 'page');
    writeFileSync(bare, '');
    const answer = await run({ suggestedName: 'page.png', base64: png.toString('base64') }, async () => ({ path: bare }));
    expect(answer).toMatchObject({ path: `${bare}.png` });
    expect(readFileSync(`${bare}.png`).equals(png)).toBe(true);
    expect(existsSync(bare)).toBe(false);
    rmSync(dir, { recursive: true, force: true });
  });

  it('writes nothing when the dialog is cancelled, and refuses a request without a picture', async () => {
    expect(await run({ suggestedName: 'a.png', base64: png.toString('base64') }, async () => ({ path: null }))).toMatchObject({ path: null });
    expect(await run({ suggestedName: 'a.png' }, async () => ({ path: null }))).toMatchObject({ error: 'bad-request' });
    expect(await run({ suggestedName: 'a.png', base64: '' }, async () => ({ path: null }))).toMatchObject({ error: 'bad-size' });
  });
});
