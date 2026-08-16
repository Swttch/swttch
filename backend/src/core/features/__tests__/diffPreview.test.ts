/**
 * Deciding WHETHER to open a diff matters as much as computing it: an extra
 * editor tab for a no-op edit, or for a tool that never touches a file, is a
 * tab the user has to close mid-approval.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveDiffPreview, openDiffForPermission } from '../diffPreview';

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

    expect(preview).toEqual({
      filePath: file,
      oldContent: 'hello world\n',
      newContent: 'hello there\n',
    });
  });

  it('previews a Write that creates a new file as an empty-to-content diff', async () => {
    const file = join(dir, 'new.txt');
    const preview = await resolveDiffPreview('Write', { file_path: file, content: 'fresh' });
    expect(preview).toEqual({ filePath: file, oldContent: '', newContent: 'fresh' });
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

  it('passes the tool_use_id through so the IDE can tie the diff to the request', async () => {
    const file = join(dir, 'a.txt');
    writeFileSync(file, 'x');
    const { bridge, calls } = fakeBridge();

    await openDiffForPermission(bridge, 'Write', 'toolu_42', { file_path: file, content: 'y' });

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ filePath: file, toolUseId: 'toolu_42' });
  });

  it('opens nothing when there is no faithful preview', async () => {
    const { bridge, calls } = fakeBridge();
    await openDiffForPermission(bridge, 'Bash', 'toolu_1', { command: 'ls' });
    expect(calls).toHaveLength(0);
  });

  it('swallows a bridge failure — the permission prompt must still go through', async () => {
    const file = join(dir, 'a.txt');
    writeFileSync(file, 'x');
    const bridge = {
      openDiff: async () => { throw new Error('no IDE'); },
    } as never;

    await expect(
      openDiffForPermission(bridge, 'Write', 'toolu_1', { file_path: file, content: 'y' }),
    ).resolves.toBeUndefined();
  });
});
