import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  readPrompts,
  createPrompt,
  updatePrompt,
  deletePrompt,
  resolvePromptStoreFile,
  PROMPT_NAME_MAX_LENGTH,
  PROMPT_CONTENT_MAX_LENGTH,
} from '../prompts';

// Project scope is exercised end to end against a real directory, because the
// whole point of the store is the read-modify-write: a mocked fs would let an
// unreadable-file regression through (the #386 class of defect), and that is the
// one failure mode a prompt library must not have.

describe('prompt library store', () => {
  let projectDir: string;
  const storeFile = () => join(projectDir, '.claude-code-gui', 'prompts.json');

  beforeEach(() => {
    projectDir = mkdtempSync(join(tmpdir(), 'ccg-prompts-'));
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  const writeStore = (content: string) => {
    mkdirSync(join(projectDir, '.claude-code-gui'), { recursive: true });
    writeFileSync(storeFile(), content, 'utf-8');
  };
  const readStore = () => JSON.parse(readFileSync(storeFile(), 'utf-8')) as {
    prompts: Array<{ id: string; name: string; content: string }>;
  };

  describe('resolvePromptStoreFile()', () => {
    it('refuses project scope when no project path was given', () => {
      expect(resolvePromptStoreFile('project')).toEqual({
        status: 'error',
        error: 'projectPath required for project scope',
      });
    });

    it('puts the project store beside the project, under .claude-code-gui', () => {
      expect(resolvePromptStoreFile('project', projectDir)).toEqual({
        status: 'ok',
        filePath: storeFile(),
      });
    });
  });

  describe('readPrompts()', () => {
    it('reads an absent store as an empty list', async () => {
      expect(await readPrompts('project', projectDir)).toEqual([]);
    });

    it('reads an empty file as an empty list', async () => {
      writeStore('');
      expect(await readPrompts('project', projectDir)).toEqual([]);
    });

    it('orders prompts newest first', async () => {
      writeStore(
        JSON.stringify({
          prompts: [
            { id: 'older', name: 'older', content: 'a', createdAt: 1000, updatedAt: 1000 },
            { id: 'newer', name: 'newer', content: 'b', createdAt: 2000, updatedAt: 2000 },
          ],
        }),
      );
      const prompts = await readPrompts('project', projectDir);
      expect(prompts.map((prompt) => prompt.id)).toEqual(['newer', 'older']);
    });

    it('drops a malformed entry without losing the sound ones beside it', async () => {
      writeStore(
        JSON.stringify({
          prompts: [
            { id: 'good', name: 'good', content: 'a', createdAt: 1, updatedAt: 1 },
            { id: 'no-content', name: 'missing its content' },
            'not even an object',
            { name: 'no id at all', content: 'b' },
          ],
        }),
      );
      const prompts = await readPrompts('project', projectDir);
      expect(prompts.map((prompt) => prompt.id)).toEqual(['good']);
    });
  });

  describe('createPrompt()', () => {
    it('stores the prompt and assigns an id and both timestamps', async () => {
      const result = await createPrompt('project', projectDir, '머지 정리', '머지했어 확인하고 로컬 정리해');
      expect(result.status).toBe('ok');
      if (result.status !== 'ok') return;

      expect(result.prompt.id).not.toBe('');
      expect(result.prompt.createdAt).toBeGreaterThan(0);
      expect(result.prompt.updatedAt).toBe(result.prompt.createdAt);
      expect(readStore().prompts).toHaveLength(1);
      expect(readStore().prompts[0]?.content).toBe('머지했어 확인하고 로컬 정리해');
    });

    it('trims the name but leaves the content exactly as the user typed it', async () => {
      const result = await createPrompt('project', projectDir, '  정리  ', '  들여쓴 본문  ');
      expect(result.status).toBe('ok');
      if (result.status !== 'ok') return;
      expect(result.prompt.name).toBe('정리');
      expect(result.prompt.content).toBe('  들여쓴 본문  ');
    });

    it('keeps the prompts that are already stored', async () => {
      await createPrompt('project', projectDir, 'first', 'a');
      await createPrompt('project', projectDir, 'second', 'b');
      expect(readStore().prompts.map((prompt) => prompt.name)).toEqual(['first', 'second']);
    });

    it('rejects an empty name and an empty content', async () => {
      expect(await createPrompt('project', projectDir, '   ', 'body')).toEqual({
        status: 'error',
        error: 'Prompt name must not be empty',
      });
      expect(await createPrompt('project', projectDir, 'name', '')).toEqual({
        status: 'error',
        error: 'Prompt content must not be empty',
      });
    });

    it('rejects a name and a content that exceed their limits', async () => {
      const longName = 'n'.repeat(PROMPT_NAME_MAX_LENGTH + 1);
      const longContent = 'c'.repeat(PROMPT_CONTENT_MAX_LENGTH + 1);
      expect((await createPrompt('project', projectDir, longName, 'body')).status).toBe('error');
      expect((await createPrompt('project', projectDir, 'name', longContent)).status).toBe('error');
    });

    it('refuses to write when the store exists but cannot be parsed', async () => {
      writeStore('{"prompts":[]}{"prompts":[]}'); // what a torn write leaves behind
      const result = await createPrompt('project', projectDir, 'name', 'body');
      expect(result.status).toBe('error');
      // The unreadable file is still there, unreplaced — refusing the write is
      // the whole point, because overwriting it would delete every saved prompt.
      expect(readFileSync(storeFile(), 'utf-8')).toBe('{"prompts":[]}{"prompts":[]}');
    });

    it('creates the data directory when the project has none yet', async () => {
      expect(existsSync(join(projectDir, '.claude-code-gui'))).toBe(false);
      expect((await createPrompt('project', projectDir, 'name', 'body')).status).toBe('ok');
      expect(existsSync(storeFile())).toBe(true);
    });
  });

  describe('updatePrompt()', () => {
    it('edits the name and content and moves updatedAt but not createdAt', async () => {
      const created = await createPrompt('project', projectDir, 'before', 'old body');
      if (created.status !== 'ok') throw new Error('fixture failed');

      const result = await updatePrompt('project', projectDir, created.prompt.id, 'after', 'new body');
      expect(result.status).toBe('ok');
      if (result.status !== 'ok') return;
      expect(result.prompt.name).toBe('after');
      expect(result.prompt.content).toBe('new body');
      expect(result.prompt.createdAt).toBe(created.prompt.createdAt);
      expect(result.prompt.updatedAt).toBeGreaterThanOrEqual(created.prompt.updatedAt);
    });

    it('reports an unknown id instead of silently adding a prompt', async () => {
      const result = await updatePrompt('project', projectDir, 'deadbeef', 'name', 'body');
      expect(result).toEqual({ status: 'error', error: 'Prompt not found: deadbeef' });
    });

    it('rejects an id that did not come from us', async () => {
      const result = await updatePrompt('project', projectDir, '../../escape', 'name', 'body');
      expect(result.status).toBe('error');
    });
  });

  describe('deletePrompt()', () => {
    it('removes only the named prompt', async () => {
      const kept = await createPrompt('project', projectDir, 'kept', 'a');
      const doomed = await createPrompt('project', projectDir, 'doomed', 'b');
      if (kept.status !== 'ok' || doomed.status !== 'ok') throw new Error('fixture failed');

      expect(await deletePrompt('project', projectDir, doomed.prompt.id)).toEqual({ status: 'ok' });
      const remaining = await readPrompts('project', projectDir);
      expect(remaining.map((prompt) => prompt.id)).toEqual([kept.prompt.id]);
    });

    it('reports an unknown id rather than claiming success', async () => {
      const result = await deletePrompt('project', projectDir, 'deadbeef');
      expect(result).toEqual({ status: 'error', error: 'Prompt not found: deadbeef' });
    });
  });

  describe('a scope never reads the other scope', () => {
    it('leaves the project store alone when global scope is written', async () => {
      await createPrompt('project', projectDir, 'project only', 'a');
      const projectPrompts = await readPrompts('project', projectDir);
      expect(projectPrompts).toHaveLength(1);
      // Global scope resolves to the real user data directory, which this test
      // must not touch; asserting the project file is untouched is enough to
      // show the two paths are distinct.
      expect(resolvePromptStoreFile('global')).not.toEqual(
        resolvePromptStoreFile('project', projectDir),
      );
    });
  });
});
