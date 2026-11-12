import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { saveSentFilesHandler } from '../saveSentFiles';

const sentLog: Array<{ type: string; body: Record<string, unknown> }> = [];

/** The handler's answer to the request: the ACK among everything it sent. */
function run(payload: Record<string, unknown>) {
  sentLog.length = 0;
  const connections = { sendTo: (_id: string, type: string, body: Record<string, unknown>) => sentLog.push({ type, body }) };
  return saveSentFilesHandler('c', { type: 'SAVE_SENT_FILES', requestId: 'r', payload } as never, connections as never)
    .then(() => sentLog.find((entry) => entry.type === 'ACK')?.body);
}

function setup(files: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), 'ccg-sent-many-'));
  const source = join(dir, 'source');
  const target = join(dir, 'target');
  mkdirSync(source);
  mkdirSync(target);
  const paths: Record<string, string> = {};
  for (const [name, contents] of Object.entries(files)) {
    paths[name] = join(source, name);
    writeFileSync(paths[name], contents);
  }
  return { dir, target, paths };
}

describe('saveSentFilesHandler', () => {
  it('copies each file into the chosen folder under its own name', async () => {
    const { dir, target, paths } = setup({ 'a.md': 'AAA', 'b.csv': 'BB' });
    const answer = await run({
      files: [{ path: paths['a.md'], name: 'a.md' }, { path: paths['b.csv'], name: 'b.csv' }],
      folder: target,
    });
    expect(answer).toMatchObject({
      saved: [{ path: paths['a.md'], savedPath: join(target, 'a.md') }, { path: paths['b.csv'], savedPath: join(target, 'b.csv') }],
      failed: [],
    });
    expect(readFileSync(join(target, 'a.md'), 'utf-8')).toBe('AAA');
    expect(readFileSync(join(target, 'b.csv'), 'utf-8')).toBe('BB');
    rmSync(dir, { recursive: true, force: true });
  });

  it('never writes over a file that is already there: the new one gets a number', async () => {
    const { dir, target, paths } = setup({ 'a.md': 'NEW' });
    writeFileSync(join(target, 'a.md'), 'OLD');
    const answer = await run({ files: [{ path: paths['a.md'], name: 'a.md' }], folder: target });
    expect(answer).toMatchObject({ saved: [{ savedPath: join(target, 'a (1).md') }] });
    expect(readFileSync(join(target, 'a.md'), 'utf-8')).toBe('OLD');
    expect(readFileSync(join(target, 'a (1).md'), 'utf-8')).toBe('NEW');
    rmSync(dir, { recursive: true, force: true });
  });

  it('reports each file as it is copied, by that file\'s own path', async () => {
    const { dir, target, paths } = setup({ 'a.md': 'AAA', 'b.csv': 'BB' });
    await run({ files: [{ path: paths['a.md'], name: 'a.md' }, { path: paths['b.csv'], name: 'b.csv' }], folder: target });
    const progress = sentLog.filter((entry) => entry.type === 'SAVE_SENT_FILE_PROGRESS').map((entry) => entry.body);
    expect(progress.filter((p) => p.path === paths['a.md']).pop()).toEqual({ path: paths['a.md'], loaded: 3, size: 3 });
    expect(progress.filter((p) => p.path === paths['b.csv']).pop()).toEqual({ path: paths['b.csv'], loaded: 2, size: 2 });
    rmSync(dir, { recursive: true, force: true });
  });

  it('saves the files it can and names the ones it cannot', async () => {
    const { dir, target, paths } = setup({ 'a.md': 'AAA' });
    const missing = join(dir, 'source', 'gone.md');
    const answer = await run({ files: [{ path: missing, name: 'gone.md' }, { path: paths['a.md'], name: 'a.md' }], folder: target });
    expect(answer).toMatchObject({ saved: [{ path: paths['a.md'] }], failed: [missing] });
    expect(existsSync(join(target, 'gone.md'))).toBe(false);
    rmSync(dir, { recursive: true, force: true });
  });

  it('keeps a file inside the folder whatever name it is asked for', async () => {
    const { dir, target, paths } = setup({ 'a.md': 'AAA' });
    const answer = await run({ files: [{ path: paths['a.md'], name: '../escape.md' }], folder: target });
    expect(answer).toMatchObject({ saved: [{ savedPath: join(target, 'escape.md') }] });
    expect(existsSync(join(dir, 'escape.md'))).toBe(false);
    rmSync(dir, { recursive: true, force: true });
  });

  it('refuses a bad request and a folder that is not there', async () => {
    const { dir, paths } = setup({ 'a.md': 'AAA' });
    expect(await run({ folder: dir })).toMatchObject({ error: 'bad-request' });
    expect(await run({ files: [], folder: dir })).toMatchObject({ error: 'bad-request' });
    expect(await run({ files: [{ path: paths['a.md'], name: 'a.md' }], folder: join(dir, 'nope') })).toMatchObject({ error: 'bad-folder' });
    rmSync(dir, { recursive: true, force: true });
  });
});
