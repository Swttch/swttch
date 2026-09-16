import { getEnvApiKeys } from './claude-settings';
import type { ConnectionManager } from '../../ws/connection-manager';
import { MessageType } from '../../shared';

const AUTH_ERROR_PATTERNS = [
  /invalid.?api.?key/i,
  /authentication/i,
  /unauthorized/i,
  /\b401\b/,
  /invalid.?x-api-key/i,
  /permission.?denied.*api/i,
  /expired.*key|key.*expired/i,
  /invalid.*token/i,
  /could not validate credentials/i,
];

/**
 * Returns true if the given message looks like an authentication error.
 */
export function isAuthError(message: string): boolean {
  return AUTH_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}

/**
 * The failure detail carried by a CLI `result` event, or null when the turn did not fail.
 *
 * A failed turn carries NO `error` object. The human-readable text sits in `result` and
 * the HTTP status in `api_error_status`, while `subtype` still reads "success" — so the
 * only field that decides failure is `is_error`. Code that looked for `error.message`
 * never fired, which is why an authentication failure reached the user with no diagnosis
 * at all (#446).
 *
 * Falls back to a synthesized "API error <status>" when the CLI failed without text, so a
 * status-only failure still reaches {@link isAuthError}.
 */
export function authFailureDetail(event: Record<string, unknown>): string | null {
  if (event.is_error !== true) return null;
  const text = typeof event.result === 'string' ? event.result.trim() : '';
  if (text) return text;
  const status = typeof event.api_error_status === 'number' ? event.api_error_status : null;
  return status === null ? null : `API error ${status}`;
}

/**
 * Check if error is auth-related and env has API keys.
 * If so, broadcast AUTH_ERROR_DIAGNOSIS event to the session.
 * Silently no-ops if the error is not auth-related or no env API keys are found.
 */
export async function diagnoseAuthError(
  sessionId: string,
  errorMessage: string,
  connections: ConnectionManager,
): Promise<void> {
  if (!isAuthError(errorMessage)) return;

  const envApiKeys = await getEnvApiKeys();
  if (envApiKeys.length === 0) return;

  connections.broadcastToSession(sessionId, MessageType.AUTH_ERROR_DIAGNOSIS, {
    envApiKeys,
    message: `Authentication error detected. The following API keys are set in ~/.claude/settings.json env: ${envApiKeys.join(', ')}. These keys may be expired or invalid.`,
  });
}
