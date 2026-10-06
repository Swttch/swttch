import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * `claude -p --effort high` on a CLI that predates the flag exits at once with
 * `error: unknown option '--effort'`, and the chat never starts. The flag is therefore
 * passed only where the CLI takes it. Two questions are asked, cheapest first: does
 * `--help` list it, and if not, does the argument parser accept it anyway. The second
 * exists because 2.1.38 through 2.1.4x take `--effort` without listing it.
 */

type ExecResult = { stdout: string; stderr: string };
const exec = vi.fn<(args: string[], options?: unknown) => Promise<ExecResult>>();

vi.mock('../../claude', () => ({
  Claude: { exec: (args: string[], options?: unknown) => exec(args, options) },
}));

import {
  cliSupportsFlag,
  cliTakesEffortFlag,
  forgetFlagSupport,
  helpListsFlag,
  parserAcceptsFlag,
} from '../cli-flag-support';

// Lines copied from the real `claude --help` of 2.1.291, which lists the flag.
const HELP_WITH_EFFORT = `Options:
  --disable-slash-commands              Disable all skills
  --disallowedTools, --disallowed-tools <tools...>
      Comma or space-separated list of tool names to deny (e.g. "Bash(git *)
      Edit")
  --effort <level>                      Effort level for the current session
                                        (low, medium, high, xhigh, max)
  --environment <environment_id>        Create a new cloud session that runs on
`;

// Lines copied from the real `claude --help` of 2.0.22 and of 2.1.45: neither lists it.
const HELP_WITHOUT_EFFORT = `Options:
  -d, --debug [filter]                              Enable debug mode with optional category filtering (e.g.,
  --verbose                                         Override verbose mode setting from config
  -p, --print                                       Print response and exit (useful for pipes). Note: The work
  --output-format <format>                          Output format (only works with --print): "text" (default),
  --include-partial-messages                        Include partial message chunks as they arrive (only works
`;

// What `claude -p --effort high` printed, with no prompt given, on the real CLIs.
const REJECTED = "error: unknown option '--effort'\n";
const ACCEPTED_THEN_NO_PROMPT = 'Error: Input must be provided either through stdin or as a prompt argument when using --print\n';

/** Claude.exec rejects on a non-zero exit and keeps what the CLI printed on the error. */
function exitsWith(printed: string): Error & { stdout: string; stderr: string } {
  return Object.assign(new Error('Command failed'), { stdout: '', stderr: printed });
}

/** Routes the two questions: `--help`, and the parser probe `-p --effort high`. */
function cli(help: string, probe: Error | ExecResult | 'hangs-up') {
  exec.mockImplementation(async (args) => {
    if (args[0] === '--help') return { stdout: help, stderr: '' };
    if (probe === 'hangs-up') throw Object.assign(new Error('timed out'), { stdout: '', stderr: '' });
    if (probe instanceof Error) throw probe;
    return probe;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  forgetFlagSupport();
});

describe('helpListsFlag', () => {
  it('finds a flag the CLI lists, with its argument', () => {
    expect(helpListsFlag(HELP_WITH_EFFORT, '--effort')).toBe(true);
  });

  it('does not find a flag the CLI does not list', () => {
    expect(helpListsFlag(HELP_WITHOUT_EFFORT, '--effort')).toBe(false);
  });

  it('is not fooled by a longer flag that starts the same way', () => {
    expect(helpListsFlag('  --effort-budget <n>   something else\n', '--effort')).toBe(false);
  });

  it('is not fooled by the flag appearing only inside a sentence', () => {
    expect(helpListsFlag('  --model <model>   Pick one; do not combine with the effort level\n', '--effort')).toBe(false);
  });

  it('finds a flag listed after a short alias', () => {
    expect(helpListsFlag('  -e, --effort <level>   Effort level\n', '--effort')).toBe(true);
  });
});

describe('parserAcceptsFlag', () => {
  it('reads an unknown-option error as a CLI that predates the flag', () => {
    expect(parserAcceptsFlag(REJECTED, '--effort')).toBe(false);
  });

  it('reads any other complaint as a CLI that got past its parser, so it knows the flag', () => {
    expect(parserAcceptsFlag(ACCEPTED_THEN_NO_PROMPT, '--effort')).toBe(true);
  });

  it('does not blame the flag for an unknown option that is a different one', () => {
    expect(parserAcceptsFlag("error: unknown option '--something-else'\n", '--effort')).toBe(true);
  });

  it('treats silence as no, since it says nothing about the flag and a wrong yes costs the chat', () => {
    expect(parserAcceptsFlag('', '--effort')).toBe(false);
    expect(parserAcceptsFlag('  \n', '--effort')).toBe(false);
  });
});

describe('cliSupportsFlag', () => {
  it('says yes from --help alone, without starting the slower probe', async () => {
    cli(HELP_WITH_EFFORT, exitsWith(ACCEPTED_THEN_NO_PROMPT));
    expect(await cliSupportsFlag('--effort', { probeValue: 'high' })).toBe(true);
    expect(exec).toHaveBeenCalledTimes(1);
    expect(exec).toHaveBeenCalledWith(['--help'], expect.objectContaining({ timeout: expect.any(Number) }));
  });

  it('says yes for a CLI that takes the flag but leaves it out of --help (2.1.38 to 2.1.4x)', async () => {
    cli(HELP_WITHOUT_EFFORT, exitsWith(ACCEPTED_THEN_NO_PROMPT));
    expect(await cliSupportsFlag('--effort', { probeValue: 'high' })).toBe(true);
    expect(exec).toHaveBeenCalledWith(['-p', '--effort', 'high'], expect.objectContaining({ closeStdin: true }));
  });

  it('says no for a CLI that predates the flag, so it is not started with it', async () => {
    cli(HELP_WITHOUT_EFFORT, exitsWith(REJECTED));
    expect(await cliSupportsFlag('--effort', { probeValue: 'high' })).toBe(false);
  });

  it('says no without probing when the caller gave no value to probe with', async () => {
    cli(HELP_WITHOUT_EFFORT, exitsWith(ACCEPTED_THEN_NO_PROMPT));
    expect(await cliSupportsFlag('--effort')).toBe(false);
    expect(exec).toHaveBeenCalledTimes(1);
  });

  it('says no when the probe gets no answer, since a wrong yes costs the whole chat', async () => {
    cli(HELP_WITHOUT_EFFORT, 'hangs-up');
    expect(await cliSupportsFlag('--effort', { probeValue: 'high' })).toBe(false);
  });

  it('says no when `claude --help` cannot be read at all', async () => {
    exec.mockRejectedValue(new Error('spawn ENOENT'));
    expect(await cliSupportsFlag('--effort', { probeValue: 'high' })).toBe(false);
  });

  it('asks the CLI once, however many spawns follow', async () => {
    cli(HELP_WITH_EFFORT, exitsWith(ACCEPTED_THEN_NO_PROMPT));
    await cliSupportsFlag('--effort', { now: 1_000 });
    await cliSupportsFlag('--effort', { now: 2_000 });
    await cliSupportsFlag('--effort', { now: 3_000 });
    expect(exec).toHaveBeenCalledTimes(1);
  });

  it('asks again after a while, because the CLI can be updated under a running backend', async () => {
    cli(HELP_WITHOUT_EFFORT, exitsWith(REJECTED));
    expect(await cliSupportsFlag('--effort', { probeValue: 'high', now: 0 })).toBe(false);

    cli(HELP_WITH_EFFORT, exitsWith(ACCEPTED_THEN_NO_PROMPT));
    expect(await cliSupportsFlag('--effort', { probeValue: 'high', now: 11 * 60 * 1000 })).toBe(true);
  });

  it('does not keep a failed ask, so the next spawn tries again rather than living with a guess', async () => {
    exec.mockRejectedValueOnce(new Error('spawn failed'));
    expect(await cliSupportsFlag('--effort', { now: 0 })).toBe(false);

    cli(HELP_WITH_EFFORT, exitsWith(ACCEPTED_THEN_NO_PROMPT));
    expect(await cliSupportsFlag('--effort', { now: 1 })).toBe(true);
  });
});

describe('cliTakesEffortFlag', () => {
  it('asks about --effort and probes with a level', async () => {
    cli(HELP_WITHOUT_EFFORT, exitsWith(ACCEPTED_THEN_NO_PROMPT));
    expect(await cliTakesEffortFlag()).toBe(true);
    expect(exec).toHaveBeenCalledWith(['-p', '--effort', 'high'], expect.anything());
  });
});
