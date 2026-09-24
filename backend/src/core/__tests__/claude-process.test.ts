import { describe, it, expect } from 'vitest';
import {
  buildCheckpointingEnv,
  buildClaudeArgs,
  isWorkflowRunning,
  needsRestartForEffort,
  needsRestartForMode,
  readReportedMode,
  resolveEffortFlag,
  stopWorkflowsForSession,
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

  // #474: the whole point of the flag. Without the pair reaching argv, a session the
  // user set to Max runs at the model's default effort instead.
  it('pins the given effort level via --effort (adjacent value)', () => {
    const args = buildClaudeArgs('--resume', 's', 'ask_before_edit', undefined, 'max');
    const i = args.indexOf('--effort');
    expect(i).toBeGreaterThanOrEqual(0);
    expect(args[i + 1]).toBe('max');
  });

  it('omits --effort when no level is given, so the CLI reads its own settings', () => {
    expect(buildClaudeArgs('--resume', 's', 'ask_before_edit')).not.toContain('--effort');
    expect(buildClaudeArgs('--resume', 's', 'ask_before_edit', undefined, undefined)).not.toContain(
      '--effort',
    );
  });

  it('carries a pinned model and a pinned effort level in the same argv', () => {
    const args = buildClaudeArgs('--resume', 's', 'plan', 'opus[1m]', 'max');
    expect(args[args.indexOf('--model') + 1]).toBe('opus[1m]');
    expect(args[args.indexOf('--effort') + 1]).toBe('max');
    expect(args[args.indexOf('--permission-mode') + 1]).toBe('plan');
  });
});

describe('resolveEffortFlag', () => {
  // The reported bug: `effortLevel: "max"` is dropped by the settings file's own
  // schema, so the flag is the only way the choice reaches the session (#474).
  it('passes max as a flag, because the settings file drops it', () => {
    expect(resolveEffortFlag({ effortLevel: 'max' })).toBe('max');
  });

  // Keeping low…xhigh on the settings file is deliberate: that is the path a
  // terminal user is on, and it already works. Handing them to the flag would pin
  // every session for the life of its process for no gain.
  it('passes no flag for the levels the settings file already honors', () => {
    expect(resolveEffortFlag({ effortLevel: 'low' })).toBeUndefined();
    expect(resolveEffortFlag({ effortLevel: 'medium' })).toBeUndefined();
    expect(resolveEffortFlag({ effortLevel: 'high' })).toBeUndefined();
    expect(resolveEffortFlag({ effortLevel: 'xhigh' })).toBeUndefined();
  });

  it('passes no flag when no level is set at all', () => {
    expect(resolveEffortFlag({})).toBeUndefined();
    expect(resolveEffortFlag({ effortLevel: null })).toBeUndefined();
    expect(resolveEffortFlag({ effortLevel: '' })).toBeUndefined();
    expect(resolveEffortFlag({ effortLevel: 7 })).toBeUndefined();
  });

  // Ultracode is `xhigh` plus a flag of its own, and xhigh is a level the settings
  // file holds — so ultracode must never pick up an `--effort`. Measured: the
  // ultracode instructions survive `--effort xhigh` but disappear under
  // `--effort max`, so the level, not the flag, is what keeps ultracode alive.
  it('passes no flag for an ultracode session, leaving its xhigh where it is', () => {
    expect(resolveEffortFlag({ effortLevel: 'xhigh', ultracode: true })).toBeUndefined();
  });

  // A level the CLI grows onto the flag before the settings file — as `max` was —
  // needs no second fix here.
  it('passes any other level through rather than dropping it a second time', () => {
    expect(resolveEffortFlag({ effortLevel: 'something-new' })).toBe('something-new');
  });
});

describe('needsRestartForEffort', () => {
  it('reuses the live process when the level it is pinned to is the one wanted', () => {
    expect(needsRestartForEffort('max', 'max')).toBe(false);
  });

  // The unflagged case is the common one: both sides mean "the settings file holds
  // the level", so moving between low…xhigh must not tear down a working CLI.
  it('reuses the live process when neither side pins a level', () => {
    expect(needsRestartForEffort(null, undefined)).toBe(false);
  });

  it('restarts when the user reaches a flagged level mid-chat', () => {
    expect(needsRestartForEffort(null, 'max')).toBe(true);
  });

  // The reported bug with its two ends swapped: `--effort` pins the process it
  // launched, so a CLI started at max keeps answering at max until it is replaced.
  it('restarts when the user leaves a flagged level mid-chat', () => {
    expect(needsRestartForEffort('max', undefined)).toBe(true);
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

// These two read the process-wide workflow tracker, which may legitimately not
// exist yet: it is created lazily on the first CLI stream event, while session
// load can ask about it before any event has arrived. They referenced a
// module-local `workflowTracker` binding that was later removed in favour of an
// imported accessor, and the references were not updated — so instead of
// answering "no tracker, so no", they threw ReferenceError.
//
// That is worse than it sounds for `isWorkflowRunning`, because its only caller
// passes it as the `isLive` callback to reconstructWorkflowTasks inside a
// try/catch that merely logs. The throw aborted the whole reconstruction, so a
// reloaded session silently showed none of its background tasks — not even the
// workflows the reconstruction did know how to rebuild.
describe('workflow tracker accessors before any tracker exists', () => {
  it('reports a workflow as not running rather than throwing', () => {
    expect(() => isWorkflowRunning('no-such-session', 'toolu_1')).not.toThrow();
    expect(isWorkflowRunning('no-such-session', 'toolu_1')).toBe(false);
  });

  it('stops workflows for an unknown session without throwing', () => {
    expect(() => stopWorkflowsForSession('no-such-session')).not.toThrow();
  });
});
