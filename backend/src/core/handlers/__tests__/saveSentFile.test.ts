import { describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { saveSentFileHandler } from '../saveSentFile';

const sentLog: Array<{ type: string; body: Record<string, unknown> }> = [];

/** The handler's answer to the request: the ACK among everything it sent. */
function run(payload: Record<string, unknown>, saveFile: (o: { suggestedName: string; contents: string }) => Promise<{ path: string | null }>) {
  sentLog.length = 0;
  const connections = { sendTo: (_id: string, type: string, body: Record<string, unknown>) => sentLog.push({ type, body }) };
  return saveSentFileHandler('c', { type: 'SAVE_SENT_FILE', requestId: 'r', payload } as never, connections as never, { saveFile } as never)
    .then(() => sentLog.find((entry) => entry.type === 'ACK')?.body);
}

function sourceFile(name: string, contents: string): { dir: string; path: string } {
  const dir = mkdtempSync(join(tmpdir(), 'ccg-sent-'));
  const path = join(dir, name);
  writeFileSync(path, contents);
  return { dir, path };
}

describe('saveSentFileHandler', () => {
  it('has the host name the file and copies the sent file over it', async () => {
    const { dir, path } = sourceFile('plan.md', '# plan');
    const target = join(dir, 'saved.md');
    const saveFile = vi.fn(async () => ({ path: target }));
    const answer = await run({ path, suggestedName: 'plan.md' }, saveFile);
    expect(saveFile).toHaveBeenCalledWith({ suggestedName: 'plan.md', contents: '' });
    expect(answer).toMatchObject({ requestId: 'r', path: target });
    expect(readFileSync(target, 'utf-8')).toBe('# plan');
    rmSync(dir, { recursive: true, force: true });
  });

  it('reports how much is written, from nothing to all of it, while the file is copied', async () => {
    const { dir, path } = sourceFile('plan.md', '# plan');
    await run({ path, suggestedName: 'plan.md' }, async () => ({ path: join(dir, 'saved.md') }));
    const progress = sentLog.filter((entry) => entry.type === 'SAVE_SENT_FILE_PROGRESS').map((entry) => entry.body);
    expect(progress[0]).toEqual({ path, loaded: 0, size: 6 });
    expect(progress[progress.length - 1]).toEqual({ path, loaded: 6, size: 6 });
    rmSync(dir, { recursive: true, force: true });
  });

  it('reports nothing when the dialog is cancelled', async () => {
    const { dir, path } = sourceFile('plan.md', '# plan');
    await run({ path, suggestedName: 'plan.md' }, async () => ({ path: null }));
    expect(sentLog.filter((entry) => entry.type === 'SAVE_SENT_FILE_PROGRESS')).toEqual([]);
    rmSync(dir, { recursive: true, force: true });
  });

  it('adds the extension the dialog dropped, and removes the empty file it made', async () => {
    const { dir, path } = sourceFile('plan.md', '# plan');
    const bare = join(dir, 'saved');
    writeFileSync(bare, '');
    const answer = await run({ path, suggestedName: 'plan.md' }, async () => ({ path: bare }));
    expect(answer).toMatchObject({ path: `${bare}.md` });
    expect(readFileSync(`${bare}.md`, 'utf-8')).toBe('# plan');
    expect(existsSync(bare)).toBe(false);
    rmSync(dir, { recursive: true, force: true });
  });

  it('writes nothing when the dialog is cancelled', async () => {
    const { dir, path } = sourceFile('plan.md', '# plan');
    expect(await run({ path, suggestedName: 'plan.md' }, async () => ({ path: null }))).toMatchObject({ path: null });
    rmSync(dir, { recursive: true, force: true });
  });

  it('refuses a bad request and a file that is not there, before asking for a place', async () => {
    const saveFile = vi.fn(async () => ({ path: null }));
    expect(await run({ suggestedName: 'a.md' }, saveFile)).toMatchObject({ error: 'bad-request' });
    expect(await run({ path: join(tmpdir(), 'ccg-no-such-file.md'), suggestedName: 'a.md' }, saveFile)).toMatchObject({ error: 'unreadable' });
    expect(saveFile).not.toHaveBeenCalled();
  });
});
