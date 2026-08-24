/**
 * A partial approval is handed to the CLI as an amended tool input, so it has
 * to satisfy the CLI's own rules — chiefly that an Edit's `old_string` still
 * occurs in the file. Measured behaviour that shapes these tests: answering an
 * Edit with a Write-shaped input (`file_path` + `content`) is rejected by the
 * CLI with "File has not been read yet", so the amended input keeps the shape
 * of the tool being answered.
 */
import { describe, it, expect } from 'vitest';
import { buildPartialApproval } from '../partialApproval';
import { computeHunks, type AcceptedRange } from '../hunks';
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

// The two changed lines, as the IDE would report them (0-based, end-exclusive).
const FIRST: AcceptedRange = { oldStart: 2, oldEnd: 3, newStart: 2, newEnd: 3 };
const SECOND: AcceptedRange = { oldStart: 30, oldEnd: 31, newStart: 30, newEnd: 31 };

describe('buildPartialApproval', () => {
  it('leaves a full acceptance untouched', () => {
    // Claude's own proposal already says this; amending it would turn an Edit
    // into a synthesized one for no reason.
    const p = preview('Edit', before, after);
    expect(buildPartialApproval(p, [FIRST, SECOND])).toBeNull();
  });

  it('keeps an Edit in Edit shape', () => {
    const p = preview('Edit', before, after);
    const amended = buildPartialApproval(p, [FIRST])!;
    expect(amended.input).toHaveProperty('old_string');
    expect(amended.input).toHaveProperty('new_string');
    expect(amended.input).not.toHaveProperty('content');
  });

  it('produces an old_string that actually occurs in the file', () => {
    // The CLI fails the edit outright otherwise — this is the invariant the
    // whole approach rests on.
    const p = preview('Edit', before, after);
    for (const picked of [[FIRST], [SECOND]]) {
      const amended = buildPartialApproval(p, picked)!;
      expect(before).toContain(amended.input.old_string as string);
    }
  });

  it('applying the amended edit yields exactly the accepted subset', () => {
    const p = preview('Edit', before, after);

    const first = buildPartialApproval(p, [FIRST])!;
    const afterFirst = before.replace(
      first.input.old_string as string,
      first.input.new_string as string,
    );
    expect(afterFirst).toContain('CHANGED 2');
    expect(afterFirst).not.toContain('CHANGED 30');
    expect(afterFirst).toContain('line 30');

    const second = buildPartialApproval(p, [SECOND])!;
    const afterSecond = before.replace(
      second.input.old_string as string,
      second.input.new_string as string,
    );
    expect(afterSecond).toContain('CHANGED 30');
    expect(afterSecond).not.toContain('CHANGED 2');
  });

  it('replaces only the content for a Write, preserving its other input', () => {
    const p = preview('Write', before, after, { content: after });
    const amended = buildPartialApproval(p, [FIRST])!;
    expect(amended.input.content).toContain('CHANGED 2');
    expect(amended.input.content).not.toContain('CHANGED 30');
    expect(amended.input.file_path).toBe('/tmp/target.ts');
  });

  it('rewrites a MultiEdit as a single Edit of the kept region', () => {
    // MultiEdit's own shape is a list of pairs; expressing "hunk 1 but not 2"
    // as that list would mean re-deriving each pair. One widened Edit says the
    // same thing and matches the file by construction.
    const p = preview('MultiEdit', before, after, { edits: [] });
    const amended = buildPartialApproval(p, [FIRST])!;
    expect(amended.input).toHaveProperty('old_string');
    expect(before).toContain(amended.input.old_string as string);
  });

  it('does not set replace_all, so only the intended occurrence changes', () => {
    const src = 'dup\nkeep\ndup\n';
    const dst = 'CHANGED\nkeep\ndup\n';
    const p = preview('Edit', src, dst);
    const amended = buildPartialApproval(p, [{ oldStart: 0, oldEnd: 1, newStart: 0, newEnd: 1 }]);
    // Either it declines, or it produces a pair applied exactly once.
    if (amended) expect(amended.input.replace_all).toBe(false);
  });

  it('has nothing to amend when the preview found no hunks', () => {
    const p = preview('Edit', 'same\n', 'same\n');
    expect(buildPartialApproval(p, [])).toBeNull();
  });

  it('applies only the region it was given', () => {
    const p = preview('Edit', before, after);
    // Out-of-range indices are dropped, so [0, 99] means [0].
    const amended = buildPartialApproval(p, [FIRST])!;
    const applied = before.replace(
      amended.input.old_string as string,
      amended.input.new_string as string,
    );
    expect(applied).toContain('CHANGED 2');
    expect(applied).not.toContain('CHANGED 30');
  });
});

/**
 * Editing the proposed side (#305). The reviewer's text is the whole answer, so
 * these assert it survives instead of being rebuilt from the ranges — which
 * describe the ORIGINAL proposal and cannot express what was typed over it.
 */
describe('buildPartialApproval with an edited proposal', () => {
  const typed = before.replace('line 2', 'TYPED BY HAND');

  it('writes the reviewer text rather than the proposal', () => {
    const p = preview('Edit', before, after);
    // Ranges still say "keep both proposed changes"; the edit overrides them.
    const amended = buildPartialApproval(p, [FIRST, SECOND], typed)!;
    const applied = before.replace(
      amended.input.old_string as string,
      amended.input.new_string as string,
    );
    expect(applied).toBe(typed);
    expect(applied).toContain('TYPED BY HAND');
    expect(applied).not.toContain('CHANGED 2');
  });

  it('keeps an edited Edit in Edit shape', () => {
    const p = preview('Edit', before, after);
    const amended = buildPartialApproval(p, [FIRST], typed)!;
    expect(amended.input).toHaveProperty('old_string');
    expect(amended.input).not.toHaveProperty('content');
    // The CLI matches old_string against the file, so it must occur verbatim.
    expect(before).toContain(amended.input.old_string as string);
  });

  it('replaces the whole file for a Write', () => {
    const p = preview('Write', before, after, { content: after });
    const amended = buildPartialApproval(p, [FIRST], typed)!;
    expect(amended.input.content).toBe(typed);
  });

  it('has nothing to amend when the edit reproduces the proposal', () => {
    // Typing something and undoing it must not turn an untouched Edit into a
    // synthesized one.
    const p = preview('Edit', before, after);
    expect(buildPartialApproval(p, [FIRST, SECOND], after)).toBeNull();
  });

  it('accepts an edit that lands on lines no range covers', () => {
    // Nothing was ticked, yet the reviewer wrote something. Rebuilding from the
    // empty range list would silently drop it.
    const p = preview('Edit', before, after);
    const amended = buildPartialApproval(p, [], typed)!;
    const applied = before.replace(
      amended.input.old_string as string,
      amended.input.new_string as string,
    );
    expect(applied).toBe(typed);
  });
});

