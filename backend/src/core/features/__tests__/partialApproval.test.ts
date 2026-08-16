/**
 * A partial approval is handed to the CLI as an amended tool input, so it has
 * to satisfy the CLI's own rules — chiefly that an Edit's `old_string` still
 * occurs in the file. Measured behaviour that shapes these tests: answering an
 * Edit with a Write-shaped input (`file_path` + `content`) is rejected by the
 * CLI with "File has not been read yet", so the amended input keeps the shape
 * of the tool being answered.
 */
import { describe, it, expect } from 'vitest';
import { buildPartialApproval, isEmptySelection } from '../partialApproval';
import { computeHunks } from '../hunks';
import type { StoredPreview } from '../diffPreview';

function preview(
  toolName: string,
  oldContent: string,
  newContent: string,
  input: Record<string, unknown> = {},
): StoredPreview {
  return {
    filePath: '/tmp/target.ts',
    oldContent,
    newContent,
    hunks: computeHunks(oldContent, newContent) ?? [],
    input: { file_path: '/tmp/target.ts', ...input },
    toolName,
  };
}

const before = Array.from({ length: 40 }, (_, i) => `line ${i}`).join('\n') + '\n';
const after = before.replace('line 2', 'CHANGED 2').replace('line 30', 'CHANGED 30');

describe('buildPartialApproval', () => {
  it('leaves a full acceptance untouched', () => {
    // Claude's own proposal already says this; amending it would turn an Edit
    // into a synthesized one for no reason.
    const p = preview('Edit', before, after);
    expect(buildPartialApproval(p, [0, 1])).toBeNull();
  });

  it('keeps an Edit in Edit shape', () => {
    const p = preview('Edit', before, after);
    const amended = buildPartialApproval(p, [0])!;
    expect(amended.input).toHaveProperty('old_string');
    expect(amended.input).toHaveProperty('new_string');
    expect(amended.input).not.toHaveProperty('content');
  });

  it('produces an old_string that actually occurs in the file', () => {
    // The CLI fails the edit outright otherwise — this is the invariant the
    // whole approach rests on.
    const p = preview('Edit', before, after);
    for (const picked of [[0], [1]]) {
      const amended = buildPartialApproval(p, picked)!;
      expect(before).toContain(amended.input.old_string as string);
    }
  });

  it('applying the amended edit yields exactly the accepted subset', () => {
    const p = preview('Edit', before, after);

    const first = buildPartialApproval(p, [0])!;
    const afterFirst = before.replace(
      first.input.old_string as string,
      first.input.new_string as string,
    );
    expect(afterFirst).toContain('CHANGED 2');
    expect(afterFirst).not.toContain('CHANGED 30');
    expect(afterFirst).toContain('line 30');

    const second = buildPartialApproval(p, [1])!;
    const afterSecond = before.replace(
      second.input.old_string as string,
      second.input.new_string as string,
    );
    expect(afterSecond).toContain('CHANGED 30');
    expect(afterSecond).not.toContain('CHANGED 2');
  });

  it('replaces only the content for a Write, preserving its other input', () => {
    const p = preview('Write', before, after, { content: after });
    const amended = buildPartialApproval(p, [0])!;
    expect(amended.input.content).toContain('CHANGED 2');
    expect(amended.input.content).not.toContain('CHANGED 30');
    expect(amended.input.file_path).toBe('/tmp/target.ts');
  });

  it('rewrites a MultiEdit as a single Edit of the kept region', () => {
    // MultiEdit's own shape is a list of pairs; expressing "hunk 1 but not 2"
    // as that list would mean re-deriving each pair. One widened Edit says the
    // same thing and matches the file by construction.
    const p = preview('MultiEdit', before, after, { edits: [] });
    const amended = buildPartialApproval(p, [0])!;
    expect(amended.input).toHaveProperty('old_string');
    expect(before).toContain(amended.input.old_string as string);
  });

  it('does not set replace_all, so only the intended occurrence changes', () => {
    const src = 'dup\nkeep\ndup\n';
    const dst = 'CHANGED\nkeep\ndup\n';
    const p = preview('Edit', src, dst);
    const amended = buildPartialApproval(p, [0]);
    // Either it declines, or it produces a pair applied exactly once.
    if (amended) expect(amended.input.replace_all).toBe(false);
  });

  it('has nothing to amend when the preview found no hunks', () => {
    const p = preview('Edit', 'same\n', 'same\n');
    expect(buildPartialApproval(p, [])).toBeNull();
  });

  it('ignores hunk numbers that do not exist', () => {
    const p = preview('Edit', before, after);
    // Out-of-range indices are dropped, so [0, 99] means [0].
    const amended = buildPartialApproval(p, [0, 99])!;
    const applied = before.replace(
      amended.input.old_string as string,
      amended.input.new_string as string,
    );
    expect(applied).toContain('CHANGED 2');
    expect(applied).not.toContain('CHANGED 30');
  });
});

describe('isEmptySelection', () => {
  it('recognises keeping nothing as a refusal', () => {
    const p = preview('Edit', before, after);
    expect(isEmptySelection(p, [])).toBe(true);
    expect(isEmptySelection(p, [99])).toBe(true);
  });

  it('is not triggered by a real selection', () => {
    const p = preview('Edit', before, after);
    expect(isEmptySelection(p, [0])).toBe(false);
  });

  it('is not triggered when there were no hunks to choose from', () => {
    // Nothing to select is not the same as choosing nothing.
    const p = preview('Edit', 'same\n', 'same\n');
    expect(isEmptySelection(p, [])).toBe(false);
  });
});
