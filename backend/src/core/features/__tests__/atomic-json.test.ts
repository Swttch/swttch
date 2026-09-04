import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, readdirSync, statSync, chmodSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { readJsonForUpdate, updateJsonFile, atomicWriteFile } from '../atomic-json';

// The defect these tests pin down (issue #386): a user's ~/.claude/settings.json
// went from 20 keys to 3. A torn write left the file unparseable, the read half
// of the next read-modify-write answered "{}" for it, and the writer saved its
// one key as the whole file.

describe('atomic-json', () => {
  let dir: string;
  const file = () => join(dir, 'settings.json');

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'atomic-json-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const write = (content: string) => writeFileSync(file(), content, 'utf-8');
  const read = () => readFileSync(file(), 'utf-8');

  describe('readJsonForUpdate()', () => {
    it('reports an absent file as an empty object, not as a failure', async () => {
      expect(await readJsonForUpdate(join(dir, 'nope.json'))).toEqual({ status: 'ok', data: {} });
    });

    it('reports an existing file that does not parse as unreadable', async () => {
      write('{"a":1}{"a":1}'); // what a torn write leaves behind
      const result = await readJsonForUpdate(file());
      expect(result.status).toBe('unreadable');
    });

    it('reports valid JSON that is not an object as unreadable', async () => {
      for (const content of ['null', '[1,2,3]', '"text"', '42']) {
        write(content);
        expect((await readJsonForUpdate(file())).status).toBe('unreadable');
      }
    });

    // An empty file has nothing to preserve, so writing over it loses nothing —
    // and refusing would leave the user permanently unable to save.
    it('treats an existing but empty file as an empty object', async () => {
      write('   \n');
      expect(await readJsonForUpdate(file())).toEqual({ status: 'ok', data: {} });
    });

    it('returns the parsed object when the file is readable', async () => {
      write('{"env":{"A":"1"}}');
      expect(await readJsonForUpdate(file())).toEqual({ status: 'ok', data: { env: { A: '1' } } });
    });
  });

  describe('updateJsonFile()', () => {
    it('preserves every other key when writing one', async () => {
      write(JSON.stringify({ a: 1, b: 2, c: 3 }));
      const result = await updateJsonFile(file(), (current) => ({ ...current, b: 20 }));
      expect(result.status).toBe('ok');
      expect(JSON.parse(read())).toEqual({ a: 1, b: 20, c: 3 });
    });

    // The wipe itself: without this guard the file below comes back holding only
    // `{"model":"x"}` and the user's other 19 keys are gone for good.
    it('refuses to write over a file that exists but cannot be read', async () => {
      const corrupted = '{"a":1}\n{"a":1}';
      write(corrupted);

      const result = await updateJsonFile(file(), (current) => ({ ...current, model: 'x' }));

      expect(result.status).toBe('error');
      expect(read()).toBe(corrupted); // left exactly as found
    });

    it('creates the file and its directory when nothing is there yet', async () => {
      const nested = join(dir, 'a', 'b', 'settings.json');
      expect((await updateJsonFile(nested, () => ({ k: 1 }))).status).toBe('ok');
      expect(JSON.parse(readFileSync(nested, 'utf-8'))).toEqual({ k: 1 });
    });

    it('skips the write entirely when mutate returns null', async () => {
      write('{"a":1}');
      const before = statSync(file()).mtimeMs;
      expect((await updateJsonFile(file(), () => null)).status).toBe('ok');
      expect(read()).toBe('{"a":1}');
      expect(statSync(file()).mtimeMs).toBe(before);
    });

    // Two of our own read-modify-write cycles overlapping used to read the same
    // starting content, so the second write dropped the first one's key.
    it('serializes concurrent updates so no key is lost', async () => {
      write(JSON.stringify({ base: true }));

      const keys = Array.from({ length: 20 }, (_, i) => `k${i}`);
      const results = await Promise.all(
        keys.map((key) => updateJsonFile(file(), (current) => ({ ...current, [key]: key }))),
      );

      expect(results.every((r) => r.status === 'ok')).toBe(true);
      const saved = JSON.parse(read());
      expect(Object.keys(saved).sort()).toEqual(['base', ...keys].sort());
    });

    it('leaves no temp files behind', async () => {
      await updateJsonFile(file(), () => ({ a: 1 }));
      expect(readdirSync(dir)).toEqual(['settings.json']);
    });

    it('reports an error instead of throwing when mutate throws', async () => {
      write('{"a":1}');
      const result = await updateJsonFile(file(), () => {
        throw new Error('boom');
      });
      expect(result).toEqual({ status: 'error', error: 'boom' });
      expect(read()).toBe('{"a":1}');
    });

    // A failed update must not wedge the chain for that path.
    it('keeps accepting updates after one fails', async () => {
      write('{"a":1}');
      await updateJsonFile(file(), () => {
        throw new Error('boom');
      });
      expect((await updateJsonFile(file(), (current) => ({ ...current, b: 2 }))).status).toBe('ok');
      expect(JSON.parse(read())).toEqual({ a: 1, b: 2 });
    });
  });

  describe('atomicWriteFile()', () => {
    it('never leaves a partially written file where a reader can see it', async () => {
      // A shorter payload written over a longer one is where the tear happened:
      // truncate-then-write leaves the old tail behind, and this must not.
      write(JSON.stringify({ long: 'x'.repeat(4000) }));
      await atomicWriteFile(file(), '{"short":1}\n');
      expect(read()).toBe('{"short":1}\n');
    });

    // The rename replaces the file itself, so the target's bits have to be
    // carried over or a file the user locked down comes back world-readable.
    // Skipped on win32: Windows has no Unix permission bits, so chmod(0o600)
    // never takes and this assertion cannot hold there regardless of the code
    // under test. This also means the credential files this protection exists
    // for are not protected by mode bits at all on Windows, which is a separate
    // concern from this test.
    it.skipIf(process.platform === 'win32')('preserves the permission bits of the file it replaces', async () => {
      write('{"a":1}');
      chmodSync(file(), 0o600);
      await atomicWriteFile(file(), '{"b":2}\n');
      expect(statSync(file()).mode & 0o777).toBe(0o600);
    });
  });
});
