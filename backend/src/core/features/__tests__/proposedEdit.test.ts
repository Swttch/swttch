/**
 * The preview a user approves on has to match what the CLI would actually
 * write. A preview that silently differs is worse than no preview at all —
 * hence the "return null rather than guess" rule these tests pin down.
 */
import { describe, it, expect } from 'vitest';
import {
  applyEditOperation,
  computeProposedContent,
  extractFilePath,
  isFileEditingTool,
} from '../proposedEdit';

describe('isFileEditingTool', () => {
  it('accepts the tools that describe a file write', () => {
    expect(isFileEditingTool('Edit')).toBe(true);
    expect(isFileEditingTool('Write')).toBe(true);
    expect(isFileEditingTool('MultiEdit')).toBe(true);
  });

  it('rejects everything else, including a missing name', () => {
    expect(isFileEditingTool('Bash')).toBe(false);
    expect(isFileEditingTool('Read')).toBe(false);
    expect(isFileEditingTool(undefined)).toBe(false);
  });
});

describe('applyEditOperation', () => {
  it('replaces the first occurrence only', () => {
    expect(applyEditOperation('a b a', { old_string: 'a', new_string: 'X' })).toBe('X b a');
  });

  it('replaces every occurrence when replace_all is set', () => {
    expect(
      applyEditOperation('a b a', { old_string: 'a', new_string: 'X', replace_all: true }),
    ).toBe('X b X');
  });

  it('declines when old_string is absent from the source', () => {
    // The CLI treats this as a failed edit; previewing a no-op would tell the
    // user their change is empty when in fact it will error.
    expect(applyEditOperation('hello', { old_string: 'nope', new_string: 'X' })).toBeNull();
  });

  it('treats an empty old_string as an insert only for an empty file', () => {
    expect(applyEditOperation('', { old_string: '', new_string: 'seed' })).toBe('seed');
    expect(applyEditOperation('existing', { old_string: '', new_string: 'seed' })).toBeNull();
  });

  it('handles a deletion (empty new_string)', () => {
    expect(applyEditOperation('keep drop', { old_string: ' drop', new_string: '' })).toBe('keep');
  });

  it('does not treat old_string as a regular expression', () => {
    // A literal replace is what the CLI does; regex semantics would corrupt
    // any edit containing '.', '$' or brackets.
    expect(applyEditOperation('a.c abc', { old_string: 'a.c', new_string: 'X' })).toBe('X abc');
  });
});

describe('computeProposedContent', () => {
  it('Write returns its content, even for a file that does not exist yet', () => {
    expect(computeProposedContent('Write', { content: 'fresh' }, null)).toBe('fresh');
    expect(computeProposedContent('Write', { content: 'over' }, 'old')).toBe('over');
  });

  it('Write with no string content has nothing to preview', () => {
    expect(computeProposedContent('Write', {}, null)).toBeNull();
  });

  it('Edit applies against the original', () => {
    expect(
      computeProposedContent('Edit', { old_string: 'one', new_string: 'two' }, 'one three'),
    ).toBe('two three');
  });

  it('Edit on a missing file cannot be previewed', () => {
    // Distinct from an empty file: there is no original to edit at all.
    expect(
      computeProposedContent('Edit', { old_string: 'a', new_string: 'b' }, null),
    ).toBeNull();
  });

  it('MultiEdit applies edits in order, each seeing the previous result', () => {
    const out = computeProposedContent(
      'MultiEdit',
      {
        edits: [
          { old_string: 'a', new_string: 'b' },
          { old_string: 'b', new_string: 'c' },
        ],
      },
      'a',
    );
    expect(out).toBe('c');
  });

  it('MultiEdit gives up entirely when one edit does not apply', () => {
    // A partial preview would show a file state that never exists.
    const out = computeProposedContent(
      'MultiEdit',
      {
        edits: [
          { old_string: 'a', new_string: 'b' },
          { old_string: 'zzz', new_string: 'c' },
        ],
      },
      'a',
    );
    expect(out).toBeNull();
  });

  it('MultiEdit with no edits has nothing to preview', () => {
    expect(computeProposedContent('MultiEdit', { edits: [] }, 'x')).toBeNull();
    expect(computeProposedContent('MultiEdit', {}, 'x')).toBeNull();
  });

  it('an unknown tool is never previewed', () => {
    expect(computeProposedContent('Bash', { command: 'rm -rf /' }, 'x')).toBeNull();
  });
});

describe('extractFilePath', () => {
  it('reads file_path, falling back to path', () => {
    expect(extractFilePath({ file_path: '/a.ts' })).toBe('/a.ts');
    expect(extractFilePath({ path: '/b.ts' })).toBe('/b.ts');
  });

  it('returns null when there is no usable path', () => {
    expect(extractFilePath({})).toBeNull();
    expect(extractFilePath({ file_path: '' })).toBeNull();
    // Some MCP tools reuse `path` for a non-string; it must not crash here.
    expect(extractFilePath({ path: ['a', 'b'] })).toBeNull();
  });
});
