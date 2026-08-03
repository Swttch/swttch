import { describe, it, expect } from 'vitest';
import { buildWin32CmdLine } from '../win-job';

describe('buildWin32CmdLine', () => {
  it('joins command + args with single spaces (mirrors Node win32 shell:true)', () => {
    expect(buildWin32CmdLine('claude', ['-p', '--verbose'])).toBe('claude -p --verbose');
  });

  it('reproduces the chat CLI invocation verbatim (no per-arg re-quoting)', () => {
    const args = [
      '-p', '--output-format', 'stream-json', '--input-format', 'stream-json',
      '--verbose', '--include-partial-messages', '--permission-prompt-tool', 'stdio',
      '--session-id', '795f99a6-b973-4963-ba19-84f095c1ff74',
    ];
    expect(buildWin32CmdLine('claude', args)).toBe(
      'claude -p --output-format stream-json --input-format stream-json --verbose ' +
        '--include-partial-messages --permission-prompt-tool stdio ' +
        '--session-id 795f99a6-b973-4963-ba19-84f095c1ff74',
    );
  });

  it('returns the bare command when there are no args', () => {
    expect(buildWin32CmdLine('claude', [])).toBe('claude');
  });
});
