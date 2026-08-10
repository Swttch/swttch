import { CONTROL_REQUEST_COMMANDS } from '@/shared';
import { CONTROL_REQUEST_COMMAND_PREFIX } from './useControlRequestCommand';

/**
 * Turning a `control_response` for one of our slash commands into the text the
 * chat shows for it.
 *
 * The CLI answers these commands with structured data rather than the report a
 * terminal user reads, because in the terminal the command's own UI renders it.
 * We have no such UI, so this is where the answer becomes something to read.
 *
 * Only responses to requests we issued are handled — see
 * {@link CONTROL_REQUEST_COMMAND_PREFIX} for how those are told apart from the
 * CLI's own control traffic.
 */

/** A `control_response` envelope as it arrives on the CLI event stream. */
export interface ControlResponseEvent {
  type?: unknown;
  response?: {
    subtype?: unknown;
    request_id?: unknown;
    response?: Record<string, unknown>;
    error?: unknown;
  };
}

export interface ControlRequestResult {
  /** Text to show in the chat. */
  text: string;
  /** True when the CLI reported an error rather than a result. */
  isError: boolean;
  /** Subtype the request was made with, e.g. `reload_plugins`. */
  subtype: string;
}

/** Read the command subtype back out of a request id we minted. */
function subtypeFromRequestId(requestId: string): string | null {
  const rest = requestId.slice(CONTROL_REQUEST_COMMAND_PREFIX.length);
  // Ids are `<prefix><subtype>-<uuid>`; subtypes never contain a hyphen, but a
  // uuid always does, so match against the known set rather than splitting.
  const command = CONTROL_REQUEST_COMMANDS.find((c) => rest.startsWith(`${c.subtype}-`));
  return command?.subtype ?? null;
}

function pluralize(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/**
 * Summarise a `reload_plugins` response the way the terminal reports it: what
 * is loaded now, and whether anything failed to load.
 */
function describeReloadPlugins(response: Record<string, unknown>): string {
  const plugins = Array.isArray(response.plugins) ? response.plugins : [];
  const errorCount = typeof response.error_count === 'number' ? response.error_count : 0;

  const names = plugins
    .map((p) => (p && typeof p === 'object' ? (p as { name?: unknown }).name : undefined))
    .filter((n): n is string => typeof n === 'string');

  const lines: string[] = [];
  lines.push(
    names.length > 0
      ? `Reloaded ${pluralize(names.length, 'plugin')}: ${names.join(', ')}`
      : 'Reloaded plugins. None are currently enabled.',
  );
  if (errorCount > 0) {
    lines.push(`${pluralize(errorCount, 'plugin')} failed to load.`);
  }
  return lines.join('\n\n');
}

/** A `side_question` response carries the answer text directly. */
function describeSideQuestion(response: Record<string, unknown>): string {
  const answer = response.response;
  return typeof answer === 'string' && answer.trim() ? answer : '(no answer)';
}

/**
 * Extract the chat text for a control_response, or null when the event is not a
 * response to one of our slash-command requests.
 */
export function parseControlRequestResult(
  event: ControlResponseEvent,
): ControlRequestResult | null {
  if (event?.type !== 'control_response') return null;

  const envelope = event.response;
  const requestId = envelope?.request_id;
  if (typeof requestId !== 'string') return null;
  if (!requestId.startsWith(CONTROL_REQUEST_COMMAND_PREFIX)) return null;

  const subtype = subtypeFromRequestId(requestId);
  if (!subtype) return null;

  if (envelope?.subtype === 'error') {
    const error = envelope.error;
    const detail = typeof error === 'string' ? error : JSON.stringify(error ?? {});
    return { text: `Command failed: ${detail}`, isError: true, subtype };
  }

  const response = envelope?.response ?? {};
  if (subtype === 'reload_plugins') {
    return { text: describeReloadPlugins(response), isError: false, subtype };
  }
  if (subtype === 'side_question') {
    return { text: describeSideQuestion(response), isError: false, subtype };
  }
  // A mapped command with no summariser yet — show the raw payload rather than
  // dropping the answer on the floor.
  return { text: JSON.stringify(response, null, 2), isError: false, subtype };
}
