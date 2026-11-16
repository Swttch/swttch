import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { scanJsonlLines, type JsonlLine } from '../scanJsonl';

describe('scanJsonlLines', () => {
  let dir: string;
  let file: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'scan-jsonl-'));
    file = join(dir, 's.jsonl');
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  async function scan(from = 0): Promise<{ lines: JsonlLine[]; completeThrough: number; size: number }> {
    const lines: JsonlLine[] = [];
    const result = await scanJsonlLines(file, from, line => lines.push(line));
    return { lines, ...result };
  }

  it('reports where every line is, so it can be read back on its own', async () => {
    const text = ['{"a":1}', '{"b":"two"}', '{"c":[3]}'].join('\n') + '\n';
    await writeFile(file, text);
    const { lines } = await scan();
    expect(lines.map(l => l.text)).toEqual(['{"a":1}', '{"b":"two"}', '{"c":[3]}']);
    const bytes = Buffer.from(text);
    for (const line of lines) {
      expect(bytes.subarray(line.offset, line.offset + line.length).toString('utf8')).toBe(line.text);
    }
  });

  it('counts bytes, not characters, so a multi-byte character does not shift the next line', async () => {
    const text = '{"ko":"한글 메시지 🙂"}\n{"next":1}\n';
    await writeFile(file, text);
    const { lines } = await scan();
    const bytes = Buffer.from(text);
    expect(lines).toHaveLength(2);
    expect(bytes.subarray(lines[1].offset, lines[1].offset + lines[1].length).toString('utf8')).toBe('{"next":1}');
  });

  it('assembles a line that is longer than a chunk', async () => {
    const big = JSON.stringify({ blob: 'x'.repeat(300_000) });
    await writeFile(file, `{"first":1}\n${big}\n{"last":2}\n`);
    const { lines } = await scan();
    expect(lines.map(l => l.text.length)).toEqual([11, big.length, 10]);
    expect(lines[1].text).toBe(big);
  });

  it('skips blank lines and takes a carriage return off the end of a line', async () => {
    await writeFile(file, '{"a":1}\r\n\r\n   \n{"b":2}\r\n');
    const { lines } = await scan();
    expect(lines.map(l => l.text)).toEqual(['{"a":1}', '{"b":2}']);
  });

  it('says where the last complete line ends, and still hands over a line that is not finished', async () => {
    await writeFile(file, '{"a":1}\n{"b":2}\n{"c":');
    const { lines, completeThrough, size } = await scan();
    expect(lines.map(l => [l.text, l.terminated])).toEqual([['{"a":1}', true], ['{"b":2}', true], ['{"c":', false]]);
    expect(completeThrough).toBe(Buffer.byteLength('{"a":1}\n{"b":2}\n'));
    expect(size).toBe(Buffer.byteLength('{"a":1}\n{"b":2}\n{"c":'));
  });

  it('continues from an offset, with the offsets still those of the whole file', async () => {
    const head = '{"a":1}\n{"b":2}\n';
    await writeFile(file, `${head}{"c":3}\n{"d":4}\n`);
    const { lines } = await scan(Buffer.byteLength(head));
    expect(lines.map(l => l.text)).toEqual(['{"c":3}', '{"d":4}']);
    expect(lines[0].offset).toBe(Buffer.byteLength(head));
  });

  it('reads an empty file as no lines', async () => {
    await writeFile(file, '');
    const { lines, completeThrough, size } = await scan();
    expect(lines).toEqual([]);
    expect(completeThrough).toBe(0);
    expect(size).toBe(0);
  });
});
