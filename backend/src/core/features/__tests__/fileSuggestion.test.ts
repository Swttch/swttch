import { describe, it, expect } from 'vitest';
import { parseFileSuggestion, runFileSuggestionCommand } from '../fileSuggestion';

describe('parseFileSuggestion', () => {
  it('returns the command config for a valid {type:"command", command} object', () => {
    const cfg = parseFileSuggestion({ fileSuggestion: { type: 'command', command: 'git ls-files' } });
    expect(cfg).toEqual({ type: 'command', command: 'git ls-files' });
  });

  it('returns null when fileSuggestion is absent', () => {
    expect(parseFileSuggestion({})).toBeNull();
  });

  it('returns null when type is not "command"', () => {
    expect(parseFileSuggestion({ fileSuggestion: { type: 'other', command: 'x' } })).toBeNull();
  });

  it('returns null when command is missing or blank', () => {
    expect(parseFileSuggestion({ fileSuggestion: { type: 'command' } })).toBeNull();
    expect(parseFileSuggestion({ fileSuggestion: { type: 'command', command: '   ' } })).toBeNull();
  });

  it('returns null when fileSuggestion is not an object', () => {
    expect(parseFileSuggestion({ fileSuggestion: 'git ls-files' })).toBeNull();
    expect(parseFileSuggestion({ fileSuggestion: ['a'] })).toBeNull();
  });
});

// The command runs under a real shell, so these only make sense on POSIX (the
// suite's CI). On win32 the command would need git bash; skip there.
const describePosix = process.platform === 'win32' ? describe.skip : describe;

describePosix('runFileSuggestionCommand (POSIX shell)', () => {
  it('parses newline-separated file paths from stdout', async () => {
    const out = await runFileSuggestionCommand(
      "printf 'src/a.ts\\nsrc/b.ts\\n'",
      'a',
      process.cwd(),
      20,
    );
    expect(out).toEqual(['src/a.ts', 'src/b.ts']);
  });

  it('passes the query to the command as {"query":...} JSON on stdin', async () => {
    // `cat` echoes stdin back, so the parsed output is the JSON payload itself.
    const out = await runFileSuggestionCommand('cat', 'hello', process.cwd(), 20);
    expect(out).toEqual(['{"query":"hello"}']);
  });

  it('caps the result at the given limit', async () => {
    const out = await runFileSuggestionCommand("printf 'a\\nb\\nc\\nd\\ne\\n'", '', process.cwd(), 3);
    expect(out).toEqual(['a', 'b', 'c']);
  });

  it('injects CLAUDE_PROJECT_DIR (hooks env parity) set to the working dir', async () => {
    const out = await runFileSuggestionCommand(
      'printf "%s\\n" "$CLAUDE_PROJECT_DIR"',
      '',
      '/tmp',
      20,
    );
    expect(out).toEqual(['/tmp']);
  });

  it('drops blank lines and trims trailing whitespace', async () => {
    const out = await runFileSuggestionCommand("printf 'a\\n\\n  b  \\n'", '', process.cwd(), 20);
    expect(out).toEqual(['a', 'b']);
  });

  it('rejects when the command exits non-zero', async () => {
    await expect(runFileSuggestionCommand('exit 3', '', process.cwd(), 20)).rejects.toThrow();
  });
});
