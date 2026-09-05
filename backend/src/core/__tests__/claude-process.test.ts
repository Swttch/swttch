import { describe, it, expect } from 'vitest';
import {
  buildCheckpointingEnv,
  buildClaudeArgs,
  needsRestartForMode,
  readReportedMode,
} from '../claude-process';

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

  // #264: `--permission-mode default` names the ask-before-edits mode; it does not
  // mean "use whatever settings say". Handing it to a caller that has no mode to ask
  // for would override the user's configured `permissions.defaultMode` with the
  // strictest mode. Omitting the flag entirely is what lets the CLI read its own
  // settings — the same thing the user gets running `claude` in a terminal.
  it('omits --permission-mode when no mode is requested, so the CLI reads its own settings', () => {
    expect(buildClaudeArgs('--session-id', 's', undefined)).not.toContain('--permission-mode');
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

describe('buildCheckpointingEnv', () => {
  // A headless spawn gets no file backups unless this variable is set, so an
  // unanswered setting has to resolve to ON — that is what a terminal user gets
  // from the CLI's own default, and matching it is the whole point (#356).
  it('turns checkpointing on when the setting is absent', () => {
    expect(buildCheckpointingEnv({})).toEqual({ CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING: 'true' });
  });

  it('turns checkpointing on when the setting says true', () => {
    expect(buildCheckpointingEnv({ fileCheckpointingEnabled: true })).toEqual({
      CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING: 'true',
    });
  });

  // Turning the official setting off in a terminal has to turn it off here too.
  it('passes nothing when the setting says false', () => {
    expect(buildCheckpointingEnv({ fileCheckpointingEnabled: false })).toEqual({});
  });

  // Only an explicit false is an answer. Anything else is a value we cannot read,
  // and reading it as "off" would silently cost the user their rewinds.
  it('keeps checkpointing on for a non-boolean value', () => {
    expect(buildCheckpointingEnv({ fileCheckpointingEnabled: 'no' })).toEqual({
      CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING: 'true',
    });
    expect(buildCheckpointingEnv({ fileCheckpointingEnabled: null })).toEqual({
      CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING: 'true',
    });
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

  // A message that asks for no particular mode is not a mode change — killing a
  // working CLI to respawn an identical one would interrupt the session for nothing.
  it('reuses the live process when the message requests no mode at all', () => {
    expect(needsRestartForMode('plan', undefined)).toBe(false);
    expect(needsRestartForMode(null, undefined)).toBe(false);
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
