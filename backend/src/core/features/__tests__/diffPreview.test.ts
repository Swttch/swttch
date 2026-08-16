/**
 * Deciding WHETHER to open a diff matters as much as computing it: an extra
 * editor tab for a no-op edit, or for a tool that never touches a file, is a
 * tab the user has to close mid-approval.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  resolveDiffPreview,
  openDiffForPermission,
  rememberPreview,
  takePreview,
  clearPreviews,
  type StoredPreview,
} from '../diffPreview';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'diffpreview-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('resolveDiffPreview', () => {
  it('previews an Edit against the file on disk', async () => {
    const file = join(dir, 'a.txt');
    writeFileSync(file, 'hello world\n');

    const preview = await resolveDiffPreview('Edit', {
      file_path: file,
      old_string: 'world',
      new_string: 'there',
    });

    expect(preview).toMatchObject({
      filePath: file,
      oldContent: 'hello world\n',
      newContent: 'hello there\n',
    });
    // The split drives per-hunk approval, so the preview must carry it.
    expect(preview?.hunks.length).toBeGreaterThan(0);
  });

  it('previews a Write that creates a new file as an empty-to-content diff', async () => {
    const file = join(dir, 'new.txt');
    const preview = await resolveDiffPreview('Write', { file_path: file, content: 'fresh' });
    expect(preview).toMatchObject({ filePath: file, oldContent: '', newContent: 'fresh' });
  });

  it('skips a tool that does not write files', async () => {
    expect(await resolveDiffPreview('Bash', { command: 'ls' })).toBeNull();
  });

  it('skips an edit with no file path', async () => {
    expect(await resolveDiffPreview('Edit', { old_string: 'a', new_string: 'b' })).toBeNull();
  });

  it('skips an Edit whose old_string is not in the file', async () => {
    // The CLI would fail this edit; a preview showing no change would mislead.
    const file = join(dir, 'a.txt');
    writeFileSync(file, 'hello');
    const preview = await resolveDiffPreview('Edit', {
      file_path: file,
      old_string: 'absent',
      new_string: 'x',
    });
    expect(preview).toBeNull();
  });

  it('skips an Edit on a file that does not exist', async () => {
    const preview = await resolveDiffPreview('Edit', {
      file_path: join(dir, 'missing.txt'),
      old_string: 'a',
      new_string: 'b',
    });
    expect(preview).toBeNull();
  });

  it('skips a no-op edit rather than opening an empty diff', async () => {
    const file = join(dir, 'a.txt');
    writeFileSync(file, 'same');
    const preview = await resolveDiffPreview('Write', { file_path: file, content: 'same' });
    expect(preview).toBeNull();
  });

  it('previews a MultiEdit as the cumulative result', async () => {
    const file = join(dir, 'a.txt');
    writeFileSync(file, 'one two');
    const preview = await resolveDiffPreview('MultiEdit', {
      file_path: file,
      edits: [
        { old_string: 'one', new_string: '1' },
        { old_string: 'two', new_string: '2' },
      ],
    });
    expect(preview?.newContent).toBe('1 2');
  });
});

describe('openDiffForPermission', () => {
  function fakeBridge() {
    const calls: unknown[] = [];
    return {
      calls,
      bridge: { openDiff: async (p: unknown) => { calls.push(p); } } as never,
    };
  }

  const somePreview = { filePath: '/tmp/a.txt', oldContent: 'x', newContent: 'y' };

  it('passes the tool_use_id through so the IDE can tie the diff to the request', async () => {
    const { bridge, calls } = fakeBridge();

    await openDiffForPermission(bridge, somePreview, 'toolu_42');

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ filePath: '/tmp/a.txt', toolUseId: 'toolu_42' });
  });

  it('sends the hunk ranges so the IDE can offer one checkbox each', async () => {
    const { bridge, calls } = fakeBridge();
    const hunks = [
      { index: 0, oldStart: 1, oldLines: 2, newStart: 1, newLines: 2, lines: ['-a', '+b'] },
    ];

    await openDiffForPermission(bridge, { ...somePreview, hunks }, 'toolu_42');

    const sent = (calls[0] as { hunks?: unknown[] }).hunks;
    expect(sent).toHaveLength(1);
    // Ranges only — the lines themselves are already in the diff the IDE shows,
    // and sending them twice would let the two disagree.
    expect(sent?.[0]).toEqual({ index: 0, oldStart: 1, oldLines: 2, newStart: 1, newLines: 2 });
  });

  it('quotes the session and request so the IDE can answer them', async () => {
    const { bridge, calls } = fakeBridge();
    await openDiffForPermission(bridge, somePreview, 'toolu_42', {
      sessionId: 'sess-1',
      controlRequestId: 'ctrl-1',
    });
    expect(calls[0]).toMatchObject({ sessionId: 'sess-1', controlRequestId: 'ctrl-1' });
  });

  it('swallows a bridge failure — the permission prompt must still go through', async () => {
    const bridge = {
      openDiff: async () => { throw new Error('no IDE'); },
    } as never;

    await expect(
      openDiffForPermission(bridge, somePreview, 'toolu_1'),
    ).resolves.toBeUndefined();
  });
});

describe('pending preview store', () => {
  function stored(id: string): StoredPreview {
    return {
      filePath: `/tmp/${id}.ts`,
      oldContent: 'a',
      newContent: 'b',
      hunks: [],
      input: {},
      toolName: 'Edit',
    };
  }

  beforeEach(() => clearPreviews());

  it('hands a preview back exactly once', () => {
    // Consumed on read: a second decision for the same request must not find
    // a stale change to apply.
    rememberPreview('t1', stored('t1'));
    expect(takePreview('t1')?.filePath).toBe('/tmp/t1.ts');
    expect(takePreview('t1')).toBeUndefined();
  });

  it('knows nothing about a request that never opened a preview', () => {
    expect(takePreview('never')).toBeUndefined();
  });

  it('drops the oldest entries rather than growing without bound', () => {
    // Turns that die without answering would otherwise leak one entry each.
    for (let i = 0; i < 130; i++) rememberPreview(`t${i}`, stored(`t${i}`));
    expect(takePreview('t0')).toBeUndefined();
    expect(takePreview('t129')).toBeDefined();
  });
});
