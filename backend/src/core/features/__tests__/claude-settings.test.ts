import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  deepMergeSettings,
  readJsonFileSafe,
  readClaudeSettings,
} from '../claude-settings';

// deepMergeSettings used to be re-implemented here because it was not exported.
// A copy passes no matter what the real function does, so it verified nothing:
// the prototype-key guard below was added to the real function while the copy
// stayed unguarded and every test still passed. It is exported and imported now.

describe('claude-settings', () => {
  describe('deepMergeSettings()', () => {
    it('should merge flat objects with override taking priority', () => {
      const base = { a: 1, b: 2, c: 3 };
      const override = { b: 20, d: 40 };
      const result = deepMergeSettings(base, override);
      expect(result).toEqual({ a: 1, b: 20, c: 3, d: 40 });
    });

    it('should deep merge nested objects', () => {
      const base = { nested: { a: 1, b: 2 }, top: 'base' };
      const override = { nested: { b: 20, c: 30 } };
      const result = deepMergeSettings(base, override);
      expect(result).toEqual({
        nested: { a: 1, b: 20, c: 30 },
        top: 'base',
      });
    });

    // Replacement is the chosen policy, not an oversight: a file that spells out
    // an array is stating the list it wants, and concatenation would leave no way
    // to drop an entry inherited from a weaker layer.
    it('should replace arrays instead of merging them', () => {
      const base = { arr: [1, 2, 3] };
      const override = { arr: [4, 5] };
      const result = deepMergeSettings(base, override);
      expect(result).toEqual({ arr: [4, 5] });
    });

    it('replaces only the same-named array, leaving sibling keys alone', () => {
      const base = { permissions: { allow: ['Bash(ls)', 'Read'], deny: ['Bash(rm)'] } };
      const override = { permissions: { allow: ['Write'] } };
      const result = deepMergeSettings(base, override);
      expect(result).toEqual({ permissions: { allow: ['Write'], deny: ['Bash(rm)'] } });
    });

    // null is a value, not a deletion: the key stays, set to null. Removing a
    // setting means removing the key from the file.
    it('should handle override with null replacing object', () => {
      const base = { nested: { a: 1 } };
      const override = { nested: null };
      const result = deepMergeSettings(base, override);
      expect(result).toEqual({ nested: null });
    });

    it('keeps a null-valued key rather than deleting it', () => {
      const result = deepMergeSettings({ k: 'value', other: 1 }, { k: null });
      expect('k' in result).toBe(true);
      expect(result).toEqual({ k: null, other: 1 });
    });

    it('should handle base with null and override with object', () => {
      const base = { nested: null };
      const override = { nested: { a: 1 } };
      const result = deepMergeSettings(base, override);
      expect(result).toEqual({ nested: { a: 1 } });
    });

    it('should handle empty base', () => {
      const result = deepMergeSettings({}, { a: 1 });
      expect(result).toEqual({ a: 1 });
    });

    it('should handle empty override', () => {
      const result = deepMergeSettings({ a: 1 }, {});
      expect(result).toEqual({ a: 1 });
    });

    it('should handle both empty', () => {
      const result = deepMergeSettings({}, {});
      expect(result).toEqual({});
    });

    it('should deep merge multiple levels', () => {
      const base = { l1: { l2: { l3: 'base', keep: true } } };
      const override = { l1: { l2: { l3: 'override' } } };
      const result = deepMergeSettings(base, override);
      expect(result).toEqual({ l1: { l2: { l3: 'override', keep: true } } });
    });

    it('should handle override replacing primitive with object', () => {
      const base = { key: 'string' };
      const override = { key: { nested: true } };
      const result = deepMergeSettings(base, override);
      expect(result).toEqual({ key: { nested: true } });
    });

    it('does not let a __proto__ key swap the merged object prototype', () => {
      // JSON.parse makes "__proto__" an own property, so Object.keys yields it
      // and a plain assignment would go through the prototype setter: the key
      // stays invisible while `in` and dot access start answering for it.
      const override = JSON.parse('{"__proto__":{"POLLUTED":"yes"}}') as Record<string, unknown>;
      const result = deepMergeSettings({ env: { SAFE: '1' } }, override);

      expect('POLLUTED' in result).toBe(false);
      expect((result as Record<string, unknown>).POLLUTED).toBeUndefined();
      expect(({} as Record<string, unknown>).POLLUTED).toBeUndefined();
      expect(result.env).toEqual({ SAFE: '1' });
    });

    it('drops a constructor key rather than shadowing Object#constructor', () => {
      const override = JSON.parse('{"constructor":{"x":1}}') as Record<string, unknown>;
      const result = deepMergeSettings({ env: { SAFE: '1' } }, override);

      expect(Object.keys(result)).toEqual(['env']);
    });
  });

  describe('readJsonFileSafe()', () => {
    let dir: string;

    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), 'ccg-json-'));
    });
    afterEach(() => {
      rmSync(dir, { recursive: true, force: true });
    });

    const write = (name: string, raw: string) => {
      const path = join(dir, name);
      writeFileSync(path, raw, 'utf-8');
      return path;
    };

    it('returns {} for a missing file', async () => {
      expect(await readJsonFileSafe(join(dir, 'nope.json'))).toEqual({});
    });

    it('returns {} for unparseable JSON', async () => {
      expect(await readJsonFileSafe(write('a.json', '{ not json'))).toEqual({});
    });

    // Valid JSON that is not a settings object. Returned as-is, `null` made
    // Object.keys throw during a merge and took the other file's settings with
    // it; an array or string leaked index keys ("0", "1", ...) into settings.
    it('returns {} for a file that is literally null', async () => {
      expect(await readJsonFileSafe(write('b.json', 'null'))).toEqual({});
    });

    it('returns {} for a top-level array', async () => {
      expect(await readJsonFileSafe(write('c.json', '[1,2,3]'))).toEqual({});
    });

    it('returns {} for a top-level string or number', async () => {
      expect(await readJsonFileSafe(write('d.json', '"text"'))).toEqual({});
      expect(await readJsonFileSafe(write('e.json', '42'))).toEqual({});
    });

    it('returns the object for a normal settings file', async () => {
      expect(await readJsonFileSafe(write('f.json', '{"env":{"A":"1"}}'))).toEqual({ env: { A: '1' } });
    });
  });

  describe('readClaudeSettings()', () => {
    let configDir: string;
    let saved: string | undefined;

    beforeEach(() => {
      configDir = mkdtempSync(join(tmpdir(), 'ccg-cs-'));
      mkdirSync(configDir, { recursive: true });
      saved = process.env.CLAUDE_CONFIG_DIR;
      process.env.CLAUDE_CONFIG_DIR = configDir;
    });
    afterEach(() => {
      if (saved === undefined) delete process.env.CLAUDE_CONFIG_DIR;
      else process.env.CLAUDE_CONFIG_DIR = saved;
      rmSync(configDir, { recursive: true, force: true });
    });

    const write = (name: string, raw: string) =>
      writeFileSync(join(configDir, name), raw, 'utf-8');

    it('merges env deeply instead of replacing the whole block', async () => {
      write('settings.json', '{"env":{"A":"1","B":"2"}}');
      write('settings.local.json', '{"env":{"B":"two","C":"3"}}');

      expect((await readClaudeSettings()).env).toEqual({ A: '1', B: 'two', C: '3' });
    });

    it('keeps settings.json when settings.local.json is unusable', async () => {
      write('settings.json', '{"env":{"KEPT":"1"}}');
      write('settings.local.json', 'null');

      expect((await readClaudeSettings()).env).toEqual({ KEPT: '1' });
    });
  });
});
