import { describe, it, expect } from 'vitest';
import {
  PROMPT_EXPORT_FORMAT,
  buildExportFile,
  exportFileName,
  extractPromptEntries,
  normaliseImportedPrompt,
  parseImportFile,
  buildImportPreview,
  applyImport,
} from '../prompt-transfer';
import type { SavedPrompt } from '../prompts';

const prompt = (over: Partial<SavedPrompt> = {}): SavedPrompt => ({
  id: 'p1',
  name: 'a name',
  content: 'some content',
  createdAt: 1000,
  updatedAt: 1000,
  ...over,
});

describe('buildExportFile', () => {
  it('stamps the format so a reader can tell where the file came from', () => {
    const file = buildExportFile([prompt()], new Date('2026-09-13T01:02:03Z'));
    expect(file.format).toBe(PROMPT_EXPORT_FORMAT);
    expect(file.promptCount).toBe(1);
    expect(file.prompts).toHaveLength(1);
  });

  it('names the file after the moment it was written', () => {
    expect(exportFileName(new Date('2026-09-13T01:02:03Z'))).toBe('prompts-20260913010203.json');
  });
});

describe('extractPromptEntries', () => {
  it('reads our own export file', () => {
    const entries = extractPromptEntries({ format: PROMPT_EXPORT_FORMAT, prompts: [prompt()] });
    expect(entries).toHaveLength(1);
  });

  it('reads our on-disk store, which has no format envelope', () => {
    expect(extractPromptEntries({ prompts: [prompt()] })).toHaveLength(1);
  });

  // The reference plugin keys its store by id instead of listing prompts, so a
  // user pointing at that file must not be turned away.
  it('reads a store that keys its prompts by id', () => {
    const entries = extractPromptEntries({
      prompts: {
        abc: { name: 'n', content: 'c' },
        def: { name: 'n2', content: 'c2' },
      },
    });
    expect(entries).toHaveLength(2);
    expect((entries as Array<{ id: string }>)[0].id).toBe('abc');
  });

  it('keeps an entry that carries its own id rather than overwriting it', () => {
    const entries = extractPromptEntries({ prompts: { key: { id: 'own', name: 'n', content: 'c' } } });
    expect((entries as Array<{ id: string }>)[0].id).toBe('own');
  });

  it('reads a bare array', () => {
    expect(extractPromptEntries([prompt()])).toHaveLength(1);
  });

  it('refuses something that is not a prompt file at all', () => {
    expect(extractPromptEntries({ settings: {} })).toBeNull();
    expect(extractPromptEntries('a string')).toBeNull();
    expect(extractPromptEntries(null)).toBeNull();
  });
});

describe('normaliseImportedPrompt', () => {
  it('keeps a well-formed prompt as it is', () => {
    expect(normaliseImportedPrompt(prompt(), 5000)).toEqual(prompt());
  });

  it('fills in missing timestamps', () => {
    const result = normaliseImportedPrompt({ id: 'p1', name: 'n', content: 'c' }, 5000);
    expect(result).toEqual({ id: 'p1', name: 'n', content: 'c', createdAt: 5000, updatedAt: 5000 });
  });

  // Ids are ours to generate; another tool's format for one is not a reason to
  // refuse the prompt itself.
  it('replaces an id we would never have written', () => {
    const result = normaliseImportedPrompt({ id: 'has spaces!', name: 'n', content: 'c' }, 5000);
    expect(result?.id).not.toBe('has spaces!');
    expect(result?.name).toBe('n');
  });

  it('drops an entry with no name or no content', () => {
    expect(normaliseImportedPrompt({ id: 'p1', content: 'c' }, 0)).toBeNull();
    expect(normaliseImportedPrompt({ id: 'p1', name: 'n' }, 0)).toBeNull();
    expect(normaliseImportedPrompt({ id: 'p1', name: '   ', content: 'c' }, 0)).toBeNull();
  });

  it('drops an entry that breaks the stored limits', () => {
    expect(normaliseImportedPrompt({ name: 'x'.repeat(61), content: 'c' }, 0)).toBeNull();
    expect(normaliseImportedPrompt({ name: 'n', content: 'x'.repeat(100001) }, 0)).toBeNull();
  });

  it('drops something that is not an object', () => {
    expect(normaliseImportedPrompt('nope', 0)).toBeNull();
    expect(normaliseImportedPrompt(['a'], 0)).toBeNull();
  });
});

describe('parseImportFile', () => {
  it('says so when the file is not JSON', () => {
    expect(parseImportFile('{ not json')).toEqual({ status: 'error', error: 'not-json' });
  });

  it('says so when the JSON is not a prompt file', () => {
    expect(parseImportFile('{"settings":{}}')).toEqual({
      status: 'error',
      error: 'unrecognised-shape',
    });
  });

  it('says so when every entry was unusable', () => {
    expect(parseImportFile('{"prompts":[{"name":"only a name"}]}')).toEqual({
      status: 'error',
      error: 'no-prompts',
    });
  });

  // One bad row must not cost the user the good ones.
  it('keeps the usable entries and drops the rest', () => {
    const result = parseImportFile(
      JSON.stringify({ prompts: [prompt(), { name: 'no content' }, prompt({ id: 'p2' })] }),
    );
    expect(result.status).toBe('ok');
    if (result.status === 'ok') expect(result.prompts).toHaveLength(2);
  });

  it('reads the other tool\'s id-keyed store end to end', () => {
    const result = parseImportFile(
      JSON.stringify({ prompts: { abc: { name: 'n', content: 'c', createdAt: 7 } } }),
      9999,
    );
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.prompts[0]).toEqual({
        id: 'abc',
        name: 'n',
        content: 'c',
        createdAt: 7,
        updatedAt: 7,
      });
    }
  });
});

describe('buildImportPreview', () => {
  it('marks an id already stored as an update and the rest as new', () => {
    const preview = buildImportPreview(
      [prompt({ id: 'p1' }), prompt({ id: 'p2' })],
      [prompt({ id: 'p1' })],
    );
    expect(preview.items.map((item) => item.status)).toEqual(['update', 'new']);
    expect(preview.newCount).toBe(1);
    expect(preview.updateCount).toBe(1);
  });
});

describe('applyImport', () => {
  const existing = [prompt({ id: 'p1', name: 'stored' })];
  const incoming = [prompt({ id: 'p1', name: 'incoming' }), prompt({ id: 'p2', name: 'fresh' })];

  it('skip leaves the stored prompt untouched and still adds the new one', () => {
    const result = applyImport(existing, incoming, 'skip');
    expect(result.prompts.find((p) => p.id === 'p1')?.name).toBe('stored');
    expect(result.prompts.find((p) => p.id === 'p2')?.name).toBe('fresh');
    expect(result).toMatchObject({ imported: 1, updated: 0, skipped: 1 });
  });

  it('overwrite replaces the stored prompt in place', () => {
    const result = applyImport(existing, incoming, 'overwrite');
    expect(result.prompts.find((p) => p.id === 'p1')?.name).toBe('incoming');
    expect(result.prompts).toHaveLength(2);
    expect(result).toMatchObject({ imported: 1, updated: 1, skipped: 0 });
  });

  it('duplicate keeps both under different ids', () => {
    const result = applyImport(existing, incoming, 'duplicate');
    const named = result.prompts.filter((p) => p.name === 'incoming' || p.name === 'stored');
    expect(named).toHaveLength(2);
    expect(new Set(result.prompts.map((p) => p.id)).size).toBe(result.prompts.length);
    expect(result).toMatchObject({ imported: 2, updated: 0, skipped: 0 });
  });

  it('does not mutate the list it was given', () => {
    const original = [prompt({ id: 'p1', name: 'stored' })];
    applyImport(original, incoming, 'overwrite');
    expect(original[0].name).toBe('stored');
    expect(original).toHaveLength(1);
  });

  // Two incoming prompts sharing an id would otherwise both land, leaving the
  // library with a duplicate key it can never edit apart.
  it('treats a second incoming prompt with the same id as a conflict too', () => {
    const result = applyImport([], [prompt({ id: 'p1' }), prompt({ id: 'p1' })], 'skip');
    expect(result.prompts).toHaveLength(1);
    expect(result.skipped).toBe(1);
  });
});
