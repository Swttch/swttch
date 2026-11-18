import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readSessionTail } from '../readSessionTail';

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'session-tail-'));
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

const line = (entry: unknown) => `${JSON.stringify(entry)}\n`;
const user = (n: number, text = `u${n}`) => ({ type: 'user', uuid: `u-${n}`, message: { role: 'user', content: text } });
const reply = (n: number, text = `a${n}`) => ({ type: 'assistant', uuid: `a-${n}`, message: { role: 'assistant', content: [{ type: 'text', text }] } });

async function record(name: string, content: string): Promise<string> {
  const file = join(dir, `${name}.jsonl`);
  await writeFile(file, content);
  return file;
}

describe('readSessionTail', () => {
  it('gives all of a short record, oldest first', async () => {
    const file = await record('short', line(user(1)) + line(reply(1)));
    const tail = await readSessionTail(file, 40);
    expect(tail.map((e) => e.uuid)).toEqual(['u-1', 'a-1']);
  });

  it('gives only the newest ones when the record has more than asked, still oldest first', async () => {
    const file = await record('long', Array.from({ length: 50 }, (_, i) => line(i % 2 ? reply(i) : user(i))).join(''));
    const tail = await readSessionTail(file, 5);
    expect(tail.map((e) => e.uuid)).toEqual(['a-45', 'u-46', 'a-47', 'u-48', 'a-49']);
  });

  it('hands the entries over as they are in the record, nothing picked out of them', async () => {
    const entry = { ...reply(1), extra: { deep: [1, 2, { x: true }] }, requestId: 'r1' };
    const file = await record('asis', line(entry));
    expect(await readSessionTail(file, 40)).toEqual([entry]);
  });

  it('leaves out a last line that is not finished, which is the one the CLI is writing', async () => {
    const file = await record('writing', line(user(1)) + line(reply(1)) + '{"type":"assistant","uuid":"a-2","message":{"role":"assis');
    expect((await readSessionTail(file, 40)).map((e) => e.uuid)).toEqual(['u-1', 'a-1']);
  });

  it('leaves out entries that are neither a send nor a reply, and does not count them', async () => {
    const file = await record(
      'bookkeeping',
      line(user(1)) + line({ type: 'file-history-snapshot', messageId: 'x' }) + line({ type: 'system', content: 'x' }) + line(reply(1)),
    );
    expect((await readSessionTail(file, 2)).map((e) => e.uuid)).toEqual(['u-1', 'a-1']);
  });

  it('reads a line longer than what it reads at a time, whole', async () => {
    const big = 'x'.repeat(700 * 1024);
    const file = await record('big', line(user(1)) + line(reply(2, big)) + line(user(3)));
    const tail = await readSessionTail(file, 40);
    expect(tail.map((e) => e.uuid)).toEqual(['u-1', 'a-2', 'u-3']);
    const text = ((tail[1].message as { content: Array<{ text: string }> }).content[0]).text;
    expect(text.length).toBe(big.length);
  });

  it('keeps characters that are several bytes long whole where a read ends in the middle of one', async () => {
    // Sizes are chosen so that no matter where the 256 KiB reads end, some of the 3-byte letters are cut by one.
    const korean = '가나다라'.repeat(40 * 1024);
    const file = await record('korean', line(reply(1, korean)) + line(reply(2, korean)) + line(user(3, '끝')));
    const tail = await readSessionTail(file, 40);
    expect(tail).toHaveLength(3);
    for (const entry of tail.slice(0, 2)) {
      const text = ((entry.message as { content: Array<{ text: string }> }).content[0]).text;
      expect(text).toBe(korean);
    }
  });

  it('gives nothing for an empty record', async () => {
    expect(await readSessionTail(await record('empty', ''), 40)).toEqual([]);
  });

  it('throws with ENOENT for a session that has no record', async () => {
    await expect(readSessionTail(join(dir, 'nothing.jsonl'), 40)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
