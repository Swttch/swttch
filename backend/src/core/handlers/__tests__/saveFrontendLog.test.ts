import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { saveFrontendLogHandler } from '../saveFrontendLog';

let home: string;
let previousHome: string | undefined;

beforeEach(() => {
  previousHome = process.env.CCG_HOME;
  home = mkdtempSync(join(tmpdir(), 'ccg-front-log-'));
  process.env.CCG_HOME = home;
});

afterEach(() => {
  if (previousHome === undefined) delete process.env.CCG_HOME;
  else process.env.CCG_HOME = previousHome;
  rmSync(home, { recursive: true, force: true });
});

/** The handler's ACK for the request. */
async function run(payload: Record<string, unknown>, saveFile: () => Promise<{ path: string | null }>) {
  const sent: Array<{ type: string; body: Record<string, unknown> }> = [];
  const connections = { sendTo: (_id: string, type: string, body: Record<string, unknown>) => sent.push({ type, body }) };
  await saveFrontendLogHandler('c', { type: 'SAVE_FRONTEND_LOG', requestId: 'r', payload } as never, connections as never, { saveFile } as never);
  return sent.find((entry) => entry.type === 'ACK')?.body;
}

function uploadedFile(): { dir: string; path: string } {
  const dir = join(home, 'uploads', 'upload-id-1');
  mkdirSync(dir, { recursive: true });
  const path = join(dir, 'log.log');
  writeFileSync(path, 'the log');
  return { dir, path };
}

describe('saveFrontendLogHandler', () => {
  it('saves the uploaded log where the person chooses and removes the uploaded copy', async () => {
    const { dir, path } = uploadedFile();
    const target = join(home, 'chosen.log');

    const answer = await run({ path, suggestedName: 'log.log' }, async () => ({ path: target }));

    expect(answer).toMatchObject({ requestId: 'r', path: target });
    expect(readFileSync(target, 'utf-8')).toBe('the log');
    expect(existsSync(dir)).toBe(false);
  });

  it('removes the uploaded copy when the dialog is cancelled', async () => {
    const { dir, path } = uploadedFile();

    expect(await run({ path, suggestedName: 'log.log' }, async () => ({ path: null }))).toMatchObject({ path: null });
    expect(existsSync(dir)).toBe(false);
  });

  it('removes the uploaded copy when no dialog can be shown', async () => {
    const { dir, path } = uploadedFile();
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const answer = await run({ path, suggestedName: 'log.log' }, async () => {
      throw new Error('no dialog');
    });

    expect(answer).toMatchObject({ error: 'no dialog' });
    expect(existsSync(dir)).toBe(false);
  });

  it('touches nothing outside an upload directory', async () => {
    const saveFile = vi.fn(async () => ({ path: null }));
    const outside = join(home, 'settings.js');
    writeFileSync(outside, 'mine');
    mkdirSync(join(home, 'uploads'), { recursive: true });
    const directlyInBase = join(home, 'uploads', 'loose.log');
    writeFileSync(directlyInBase, 'loose');

    for (const path of [outside, directlyInBase, join(home, 'uploads', 'id', '..', '..', 'settings.js')]) {
      expect(await run({ path, suggestedName: 'log.log' }, saveFile)).toMatchObject({ error: 'bad-request' });
    }

    expect(saveFile).not.toHaveBeenCalled();
    expect(readFileSync(outside, 'utf-8')).toBe('mine');
    expect(existsSync(directlyInBase)).toBe(true);
  });
});
