import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, readdirSync, realpathSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { loadComposerDraft, saveComposerDraft } from '../composerDrafts';
import { emptyContent, emptyDraft, type ComposerDraft } from '../../../shared';

const picture = (id: string) => ({ id, type: 'image' as const, name: `${id}.png`, mimeType: 'image/png' });
const draftOf = (text: string, pictures: string[] = []): ComposerDraft => ({
  content: { ...emptyContent(), text, attachments: pictures.map(picture) },
  edits: {},
});

describe('composer drafts', () => {
  let home: string;
  let previousHome: string | undefined;

  beforeEach(() => {
    previousHome = process.env.CCG_HOME;
    home = realpathSync(mkdtempSync(join(tmpdir(), 'composer-drafts-')));
    process.env.CCG_HOME = home;
  });

  afterEach(() => {
    if (previousHome === undefined) delete process.env.CCG_HOME;
    else process.env.CCG_HOME = previousHome;
    rmSync(home, { recursive: true, force: true });
  });

  const blobs = (sessionId: string) => join(home, 'composer-drafts', sessionId);

  it('has nothing for a session never saved', async () => {
    expect(await loadComposerDraft('s1')).toEqual({ draft: null, editedAt: 0, blobs: {} });
  });

  it('keeps a draft with its pictures, and replaces it with the next one', async () => {
    const first = await saveComposerDraft('/work', 's1', draftOf('one', ['p1']), { p1: 'AAA' });
    expect(await loadComposerDraft('s1')).toEqual({ draft: draftOf('one', ['p1']), editedAt: first.editedAt, blobs: { p1: 'AAA' } });

    // The second save sends no bytes for a picture it sent already.
    const second = await saveComposerDraft('/work', 's1', draftOf('two', ['p1']));
    expect(second.editedAt).toBeGreaterThan(first.editedAt);
    expect(await loadComposerDraft('s1')).toMatchObject({ draft: draftOf('two', ['p1']), blobs: { p1: 'AAA' } });
  });

  it('leaves out the pictures the asker holds', async () => {
    await saveComposerDraft('/work', 's1', draftOf('x', ['p1', 'p2']), { p1: 'A', p2: 'B' });

    expect((await loadComposerDraft('s1', ['p1'])).blobs).toEqual({ p2: 'B' });
  });

  it('keeps the pictures of an edited send, and drops those nothing names', async () => {
    const withEdit: ComposerDraft = {
      content: draftOf('x').content,
      edits: { u1: draftOf('edited', ['p2']).content },
    };
    await saveComposerDraft('/work', 's1', draftOf('x', ['p1']), { p1: 'A' });
    await saveComposerDraft('/work', 's1', withEdit, { p2: 'B' });

    expect(readdirSync(blobs('s1'))).toEqual(['p2']);
    expect((await loadComposerDraft('s1')).draft).toEqual(withEdit);
  });

  it('forgets a session whose draft became empty', async () => {
    await saveComposerDraft('/work', 's1', draftOf('x', ['p1']), { p1: 'A' });

    await saveComposerDraft('/work', 's1', emptyDraft());

    expect(await loadComposerDraft('s1')).toEqual({ draft: null, editedAt: 0, blobs: {} });
    expect(existsSync(blobs('s1'))).toBe(false);
  });

  it('keeps each session apart', async () => {
    await saveComposerDraft('/work', 's1', draftOf('one'));
    await saveComposerDraft('/work', 's2', draftOf('two'));

    expect((await loadComposerDraft('s1')).draft?.content.text).toBe('one');
    expect((await loadComposerDraft('s2')).draft?.content.text).toBe('two');
  });

  it('keeps every save of one session sent at once', async () => {
    await Promise.all(['a', 'ab', 'abc'].map((text) => saveComposerDraft('/work', 's1', draftOf(text))));

    expect((await loadComposerDraft('s1')).draft?.content.text).toBe('abc');
  });

  it('takes no name that would reach outside its folder', async () => {
    await expect(async () => loadComposerDraft('../x')).rejects.toThrow();
    await saveComposerDraft('/work', 's1', draftOf('x', ['../escape']), { '../escape': 'A' });
    expect(existsSync(join(home, 'composer-drafts', 'escape'))).toBe(false);
  });
});
