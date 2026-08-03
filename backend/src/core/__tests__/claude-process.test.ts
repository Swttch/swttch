import { describe, it, expect } from 'vitest';
import { buildClaudeArgs, needsRestartForMode, readReportedMode } from '../claude-process';

describe('buildClaudeArgs', () => {
  it('includes the core stream-json print-mode flags and the session flag', () => {
    const args = buildClaudeArgs('--session-id', 'sid-1', 'ask_before_edit');
    expect(args).toEqual(
      expect.arrayContaining([
        '-p',
        '--output-format',
        'stream-json',
        '--input-format',
        'stream-json',
        '--permission-prompt-tool',
        'stdio',
      ]),
    );
    // session flag and id appear adjacent
    const i = args.indexOf('--session-id');
    expect(i).toBeGreaterThanOrEqual(0);
    expect(args[i + 1]).toBe('sid-1');
  });

  it('maps inputMode to the matching --permission-mode flag', () => {
    expect(buildClaudeArgs('--resume', 's', 'plan')).toEqual(
      expect.arrayContaining(['--permission-mode', 'plan']),
    );
    expect(buildClaudeArgs('--resume', 's', 'bypass')).toEqual(
      expect.arrayContaining(['--permission-mode', 'bypassPermissions']),
    );
    expect(buildClaudeArgs('--resume', 's', 'auto_edit')).toEqual(
      expect.arrayContaining(['--permission-mode', 'acceptEdits']),
    );
    expect(buildClaudeArgs('--resume', 's', 'auto')).toEqual(
      expect.arrayContaining(['--permission-mode', 'auto']),
    );
  });

  it('omits --permission-mode for an unknown inputMode', () => {
    expect(buildClaudeArgs('--session-id', 's', 'nonsense')).not.toContain('--permission-mode');
  });

  it('pins an explicitly selected model via --model (adjacent value)', () => {
    const args = buildClaudeArgs('--resume', 's', 'ask_before_edit', 'opus[1m]');
    const i = args.indexOf('--model');
    expect(i).toBeGreaterThanOrEqual(0);
    expect(args[i + 1]).toBe('opus[1m]');
  });

  it('omits --model when no model is given (CLI uses its own default)', () => {
    expect(buildClaudeArgs('--resume', 's', 'ask_before_edit')).not.toContain('--model');
    expect(buildClaudeArgs('--resume', 's', 'ask_before_edit', undefined)).not.toContain('--model');
  });

  it('omits --model for the "default" alias (redundant with the CLI default)', () => {
    expect(buildClaudeArgs('--resume', 's', 'ask_before_edit', 'default')).not.toContain('--model');
  });
});

describe('needsRestartForMode', () => {
  it('reuses the live process when the requested mode is what it already runs', () => {
    expect(needsRestartForMode('plan', 'plan')).toBe(false);
    expect(needsRestartForMode('ask_before_edit', 'ask_before_edit')).toBe(false);
  });

  // #172: `--permission-mode` only applies at spawn, so a live CLI keeps its original
  // mode. Reusing it would drop the user's choice AND let the CLI's next system/init
  // push the stale mode back onto the webview — the "mode turns itself off" report.
  it('restarts when the user picked a different mode mid-chat', () => {
    expect(needsRestartForMode('plan', 'ask_before_edit')).toBe(true);
    expect(needsRestartForMode('ask_before_edit', 'plan')).toBe(true);
    expect(needsRestartForMode('bypass', 'auto_edit')).toBe(true);
  });

  it('restarts when the live process mode is unknown (safer than assuming a match)', () => {
    expect(needsRestartForMode(null, 'plan')).toBe(true);
  });
});

describe('readReportedMode', () => {
  it('reads the mode the CLI announces at spawn (system/init)', () => {
    expect(readReportedMode({ type: 'system', subtype: 'init', permissionMode: 'plan' })).toBe('plan');
  });

  // #172: approving an ExitPlanMode plan leaves plan mode with NO respawn, and the CLI
  // announces that on system/status. Adopting it is what stops the next "Plan mode"
  // pick from comparing equal to a stale record and reusing a CLI that has left plan.
  it('reads the mode the CLI switches to on its own (system/status)', () => {
    expect(readReportedMode({ type: 'system', subtype: 'status', permissionMode: 'default' })).toBe(
      'ask_before_edit',
    );
  });

  it('translates CLI flag names into the webview vocabulary', () => {
    expect(readReportedMode({ type: 'system', permissionMode: 'bypassPermissions' })).toBe('bypass');
    expect(readReportedMode({ type: 'system', permissionMode: 'acceptEdits' })).toBe('auto_edit');
  });

  it('reports nothing for events that carry no permission mode', () => {
    expect(readReportedMode({ type: 'assistant' })).toBeNull();
    expect(readReportedMode({ type: 'system', subtype: 'init' })).toBeNull();
    expect(readReportedMode({ type: 'result', permissionMode: 'plan' })).toBeNull();
  });

  it('reports nothing for an unrecognized flag rather than guessing', () => {
    expect(readReportedMode({ type: 'system', permissionMode: 'somethingNew' })).toBeNull();
  });
});
