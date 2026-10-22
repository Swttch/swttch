/**
 * Token usage of one API message, as the CLI relays it from the API stream.
 *
 * `message_start` carries the usage known when the reply begins and
 * `message_delta` carries the final one. The CLI's `assistant` frame repeats the
 * `message_start` numbers and is never updated afterwards (measured on CLI
 * 2.1.308: `output_tokens` 16, 3, 2 against 76, 119, 227 in the matching
 * `message_delta`). Behind a gateway that fills only `message_delta`, the
 * `assistant` frame reads zero in every field.
 */
export interface MessageUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

const FIELDS = [
  'input_tokens',
  'output_tokens',
  'cache_creation_input_tokens',
  'cache_read_input_tokens',
] as const;

/** What the message put into the context: everything it read, wrote and answered. */
export function totalMessageTokens(usage: MessageUsage): number {
  return FIELDS.reduce((sum, field) => sum + (usage[field] ?? 0), 0);
}

/**
 * Two reports of the same message's usage as one. A message's usage only grows,
 * so each field keeps the larger value: a gateway's zeroed `message_start` gives
 * way to the real `message_delta`, and a direct API's `message_start` input
 * counts survive a `message_delta` that carries only the output.
 */
export function mergeMessageUsage(a: MessageUsage | null | undefined, b: MessageUsage | null | undefined): MessageUsage {
  const merged: MessageUsage = {};
  for (const field of FIELDS) {
    const x = a?.[field];
    const y = b?.[field];
    if (typeof x === 'number' || typeof y === 'number') {
      merged[field] = Math.max(x ?? 0, y ?? 0);
    }
  }
  return merged;
}
