import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { JsonlEdit, JsonlFile, JsonlFileUnreadableError } from '../JsonlFile';

describe('JsonlFile', () => {
  let dir: string;
  let path: string;
  let file: JsonlFile;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'jsonl-'));
    path = join(dir, 'nested', 'rows.jsonl');
    file = new JsonlFile(path);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const plant = (content: string) => {
    mkdirSync(join(dir, 'nested'), { recursive: true });
    writeFileSync(path, content, 'utf-8');
  };
  const text = () => readFileSync(path, 'utf-8');

  describe('reading', () => {
    it('reads an absent file as no lines', async () => {
      const snapshot = await file.read();

      expect(snapshot.values).toEqual([]);
      expect(snapshot.unparseable).toEqual([]);
      expect(snapshot.lineCount).toBe(0);
    });

    it('parses one value per line, in file order', async () => {
      plant('{"a":1}\n[2]\n"three"\n');

      expect((await file.read()).values).toEqual([{ a: 1 }, [2], 'three']);
    });

    it('skips blank lines and the carriage return before a line break', async () => {
      plant('{"a":1}\r\n\r\n   \n{"a":2}\r\n');

      expect((await file.read()).values).toEqual([{ a: 1 }, { a: 2 }]);
    });

    it('sets aside a line that is not JSON, exactly as written', async () => {
      plant('{"a":1}\nnot json at all\n{"a":2}\n');

      const snapshot = await file.read();

      expect(snapshot.values).toEqual([{ a: 1 }, { a: 2 }]);
      expect(snapshot.unparseable).toEqual(['not json at all']);
      expect(snapshot.lineCount).toBe(3);
    });

    it('sets aside a last line that was cut short', async () => {
      plant('{"a":1}\n{"a":2,"b":"cu');

      const snapshot = await file.read();

      expect(snapshot.values).toEqual([{ a: 1 }]);
      expect(snapshot.unparseable).toEqual(['{"a":2,"b":"cu']);
    });

    it('reads a last line that is whole but has no line break', async () => {
      plant('{"a":1}\n{"a":2}');

      expect((await file.read()).values).toEqual([{ a: 1 }, { a: 2 }]);
    });

    it('refuses rather than answering empty when the path cannot be read as a file', async () => {
      mkdirSync(path, { recursive: true });

      await expect(file.read()).rejects.toBeInstanceOf(JsonlFileUnreadableError);
    });
  });

  describe('appending', () => {
    it('creates the folder and the file, one line per value', async () => {
      await file.append([{ a: 1 }, { a: 2 }]);

      expect(text()).toBe('{"a":1}\n{"a":2}\n');
    });

    it('adds after the lines already there without reading them', async () => {
      // A line that could not be parsed would show up in a read; an append does not
      // look at it, which is what keeps the cost of a row independent of the file.
      plant('garbage\n{"a":1}\n');

      await file.append([{ a: 2 }]);

      expect(text()).toBe('garbage\n{"a":1}\n{"a":2}\n');
    });

    it('starts on a fresh line when the file ends in the middle of one', async () => {
      plant('{"a":1}\n{"a":2,"b":"cu');

      await file.append([{ a: 3 }]);

      expect(text()).toBe('{"a":1}\n{"a":2,"b":"cu\n{"a":3}\n');
      expect((await file.read()).values).toEqual([{ a: 1 }, { a: 3 }]);
    });

    it('writes nothing for no values', async () => {
      await file.append([]);

      expect(() => text()).toThrow(); // the file was not even created
    });

    it('keeps the lines of several appends at once whole and apart', async () => {
      await Promise.all(Array.from({ length: 20 }, (_, i) => file.append([{ n: i }])));

      const lines = text().split('\n').filter((line) => line !== '');
      expect(lines).toHaveLength(20);
      expect(new Set(lines.map((line) => (JSON.parse(line) as { n: number }).n)).size).toBe(20);
    });
  });

  describe('updating', () => {
    it('hands the decision what the file holds and answers what the decision answers', async () => {
      plant('{"a":1}\n');

      const answer = await file.update((snapshot) => JsonlEdit.keep(snapshot.values.length));

      expect(answer).toBe(1);
      expect(text()).toBe('{"a":1}\n');
    });

    it('rewrites the whole file from the lines it is given', async () => {
      plant('{"a":1}\n{"a":2}\n');

      await file.update(() => JsonlEdit.rewrite(['{"a":9}'], undefined));

      expect(text()).toBe('{"a":9}\n');
    });

    it('rewrites to an empty file when it is given no lines', async () => {
      plant('{"a":1}\n');

      await file.update(() => JsonlEdit.rewrite([], undefined));

      expect(text()).toBe('');
    });

    it('appends inside the same step that decided to, so a check cannot be overtaken', async () => {
      const addOnce = () =>
        file.update((snapshot) =>
          snapshot.values.length > 0 ? JsonlEdit.keep(false) : JsonlEdit.append([{ a: 1 }], true),
        );

      const added = await Promise.all([addOnce(), addOnce(), addOnce()]);

      expect(added.filter(Boolean)).toHaveLength(1);
      expect(text()).toBe('{"a":1}\n');
    });

    it('does not let a failed step stop the ones behind it', async () => {
      await expect(
        file.update(() => {
          throw new Error('boom');
        }),
      ).rejects.toThrow('boom');

      await file.append([{ a: 1 }]);

      expect(text()).toBe('{"a":1}\n');
    });

    it('refuses to decide about a file it cannot read', async () => {
      mkdirSync(path, { recursive: true });

      await expect(file.update(() => JsonlEdit.keep(null))).rejects.toBeInstanceOf(JsonlFileUnreadableError);
    });
  });
});
