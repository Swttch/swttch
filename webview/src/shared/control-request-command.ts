/**
 * Slash commands the CLI refuses to run over our transport, and the
 * `control_request` subtype that performs the same work instead.
 *
 * ## Why these commands need a different path
 *
 * We drive the CLI with `-p --input-format stream-json`, which the CLI treats
 * as a NON-INTERACTIVE session. Every built-in slash command carries a
 * `supportsNonInteractive` flag, and the CLI does two things with it:
 *
 * 1. It omits the command from the `commands` array of the `initialize`
 *    control_response — so it never appears in our autocomplete.
 * 2. If the text is sent anyway, it answers
 *    `/<name> isn't available in this environment.` instead of running it.
 *
 * That is why `/reload-plugins` looked broken in the GUI while working in the
 * terminal (issue #270). It is not something we filter out — the command never
 * reaches us.
 *
 * The CLI does, however, accept a `control_request` for the same work, which is
 * how its own non-terminal clients invoke these commands. Sending that request
 * over the stdin channel we already own gets the user the behaviour they'd get
 * in the terminal, which is the CLI-equivalence bar this project holds itself
 * to.
 *
 * ## Why only these two
 *
 * Only commands that are BOTH unavailable to us AND have a control_request
 * equivalent belong here. `/context` and `/usage` are deliberately absent: the
 * CLI already lists and runs both for us, and each has its own presentation in
 * this codebase (`/context` renders as a usage card, `/usage` opens the account
 * modal). Routing them through here would replace working features.
 *
 * ## Stability
 *
 * These subtypes are not part of a documented CLI contract, so callers must
 * treat this as a best-effort fast path and fall back to plain text delivery
 * when the request errors or the CLI doesn't answer. Losing the fast path must
 * degrade the command, never break it.
 */
export interface ControlRequestCommand {
  /** Command name as the user types it, without the leading slash. */
  name: string;
  /** `control_request` subtype that performs the command's work. */
  subtype: string;
  /** Description shown in autocomplete, matching the CLI's own wording. */
  description: string;
  /** Argument hint shown in autocomplete, matching the CLI's own wording. */
  argumentHint: string;
  /**
   * Name of the request field the command's arguments are passed in, when the
   * command takes arguments as a value rather than a flag. Commands whose
   * arguments are flags (or that take none) leave this undefined.
   */
  argumentField?: string;
}

export const CONTROL_REQUEST_COMMANDS: readonly ControlRequestCommand[] = [
  {
    name: 'reload-plugins',
    subtype: 'reload_plugins',
    description: 'Activate pending plugin changes in the current session',
    argumentHint: '[--force]',
  },
  {
    name: 'btw',
    subtype: 'side_question',
    description: 'Ask a quick side question without interrupting the main conversation',
    argumentHint: '<question>',
    argumentField: 'question',
  },
] as const;

/**
 * Find the control-request command an already-trimmed input invokes, or null.
 *
 * Matches the command name exactly, or followed by whitespace — `/btw` and
 * `/btw how do I...` both match, `/btwX` is a different word and does not.
 * Mirrors how `matchesUsageCommand` reads its own command.
 */
export function matchControlRequestCommand(
  trimmed: string,
): { command: ControlRequestCommand; args: string } | null {
  for (const command of CONTROL_REQUEST_COMMANDS) {
    const prefix = `/${command.name}`;
    if (trimmed === prefix) return { command, args: '' };
    if (trimmed.startsWith(`${prefix} `) || trimmed.startsWith(`${prefix}\t`)) {
      return { command, args: trimmed.slice(prefix.length).trim() };
    }
  }
  return null;
}

/**
 * Build the `request` object for a control-request command invocation.
 *
 * Arguments go into the field the command names; commands without one carry
 * their arguments nowhere, matching the CLI's flag-style handling.
 */
export function buildControlRequestPayload(
  command: ControlRequestCommand,
  args: string,
): Record<string, unknown> {
  const request: Record<string, unknown> = { subtype: command.subtype };
  if (command.argumentField && args) request[command.argumentField] = args;
  return request;
}
