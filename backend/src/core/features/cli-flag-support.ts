import { Claude } from '../claude';

/**
 * Whether the installed `claude` takes a flag.
 *
 * A flag an older CLI does not know does not get ignored: `claude -p --effort high`
 * on CLI 2.0.22 exits at once with `error: unknown option '--effort'`, so the chat
 * never starts. Passing a flag only where the CLI takes it keeps a newer feature from
 * taking an older CLI down with it.
 *
 * Asked of the CLI rather than worked out from its version number: the version a flag
 * arrived in is not written down anywhere we can rely on.
 *
 * Two questions, cheapest first.
 *
 * 1. Does `claude --help` list it? Takes a fraction of a second and is the contract a
 *    terminal user reads.
 * 2. If not, does the CLI's argument parser accept it anyway? `--effort` is in CLI
 *    2.1.38 through 2.1.4x and works there, but is left out of `--help`, so the first
 *    question alone would say no to a CLI that takes it. The parser answers by its
 *    error: a flag it does not know is reported as `unknown option`, while a known one
 *    gets past parsing and only complains about the missing prompt. No model is asked
 *    anything. This is slower (up to several seconds on an old CLI), which is why it
 *    comes second and why the answer is kept.
 */

/**
 * How long an answer is kept. The CLI can be updated underneath a running backend
 * (see cli-auto-update), and a flag it gained after that is worth picking up without
 * a restart, but asking on every spawn would add a process start to each one.
 */
const ANSWER_TTL_MS = 10 * 60 * 1000;

/** How long `claude --help` may take. It measures well under a second. */
const HELP_TIMEOUT_MS = 10_000;

/** How long the parser probe may take. Measured at up to six seconds on 2.1.45. */
const PARSER_PROBE_TIMEOUT_MS = 30_000;

interface Answer {
  supported: Promise<boolean>;
  askedAt: number;
}

const answers = new Map<string, Answer>();

/** Whether [helpText] lists [flag] as an option, not merely mentions it inside another word. */
export function helpListsFlag(helpText: string, flag: string): boolean {
  const escaped = flag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[\\s,])${escaped}(?=[\\s=,<\\[]|$)`, 'm').test(helpText);
}

/**
 * Whether what a CLI printed for `-p [flag] [value]` shows it knows the flag.
 *
 * Unsupported is the CLI naming the flag as an unknown option. Silence is not an answer
 * either way (a timeout, a failed start), and passing a flag the CLI rejects costs the
 * whole chat, so it counts as unsupported.
 */
export function parserAcceptsFlag(printed: string, flag: string): boolean {
  if (printed.trim() === '') return false;
  const rejected = /unknown option/i.test(printed) && printed.includes(flag);
  return !rejected;
}

async function parserTakesFlag(flag: string, value: string): Promise<boolean> {
  try {
    const { stdout, stderr } = await Claude.exec(['-p', flag, value], {
      timeout: PARSER_PROBE_TIMEOUT_MS,
      closeStdin: true,
    });
    return parserAcceptsFlag(`${stdout}\n${stderr}`, flag);
  } catch (err) {
    // A CLI exits non-zero both when it rejects the flag and when it accepts it and finds no
    // prompt, and Claude.exec keeps what it printed on the error.
    const printed = err as { stdout?: string; stderr?: string };
    return parserAcceptsFlag(`${printed.stdout ?? ''}\n${printed.stderr ?? ''}`, flag);
  }
}

export interface FlagQuestion {
  /** A value to hand the flag when asking the parser, for a flag that takes one. */
  probeValue?: string;
  /** The clock, for tests. */
  now?: number;
}

/**
 * True when the CLI takes [flag]. False when it does not, and also when the question
 * cannot be answered: not passing a flag costs the feature behind it, while passing one
 * the CLI rejects costs the whole chat.
 */
export function cliSupportsFlag(flag: string, question: FlagQuestion = {}): Promise<boolean> {
  const now = question.now ?? Date.now();
  const known = answers.get(flag);
  if (known && now - known.askedAt < ANSWER_TTL_MS) return known.supported;

  const supported = Claude.exec(['--help'], { timeout: HELP_TIMEOUT_MS, closeStdin: true })
    .then(({ stdout }) => {
      if (helpListsFlag(stdout, flag)) return true;
      return question.probeValue === undefined ? false : parserTakesFlag(flag, question.probeValue);
    })
    .catch((err: unknown) => {
      console.error(
        '[node-backend]',
        `Could not ask \`claude\` about ${flag}: ${err instanceof Error ? err.message : String(err)}`,
      );
      // A failed ask is not kept, so the next spawn asks again instead of living with a guess.
      answers.delete(flag);
      return false;
    });
  answers.set(flag, { supported, askedAt: now });
  return supported;
}

/** Whether the installed CLI takes `--effort`. */
export function cliTakesEffortFlag(): Promise<boolean> {
  return cliSupportsFlag('--effort', { probeValue: 'high' });
}

/** Forgets every answer. For tests. */
export function forgetFlagSupport(): void {
  answers.clear();
}
