import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { Claude } from '../claude';
import { MessageType } from '../../shared';

interface ClaudeAuthStatus {
  loggedIn?: boolean;
  authMethod?: string;
  email?: string;
  subscriptionType?: string | null;
  orgId?: string | null;
  orgName?: string | null;
  /**
   * Which environment variable supplied the credential, when one did.
   *
   * The CLI reports `authMethod: "claude.ai"` whether the request is signed with a
   * subscription login or with an API key, and nulls `email`, `orgName` and
   * `subscriptionType` in the API-key case. Read on its own, the panel then shows three
   * blank rows and reads as "this product does not support my plan". This field is the
   * one that says which of the two is actually in use.
   */
  apiKeySource?: string | null;
}

/**
 * Extract the `auth status` JSON, guarding against shell banner noise that can
 * prefix/suffix the real output. Returns null when nothing parseable is present.
 */
function parseAuthStatus(stdout: string): ClaudeAuthStatus | null {
  const match = stdout.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as ClaudeAuthStatus;
  } catch {
    return null;
  }
}

/**
 * Three-way login resolution — the fix for the "reauthenticate repeatedly" bug (#178):
 * a login state is only ever DETERMINED from output the CLI actually produced.
 *
 * - `determined: true` — `auth status` printed valid JSON. `loggedIn` may be true OR
 *   false; a logged-out account exits non-zero (exit 1) but still prints
 *   `{"loggedIn":false}`. runExecFile attaches that stdout to the rejected error, so
 *   we recover it in `catch` and treat it as an authoritative "logged out".
 * - `determined: false` — a real failure (timeout / spawn error / unparseable output)
 *   with no JSON to trust. This is NOT a logout; the webview keeps its last known
 *   state instead of bouncing the user to the login page.
 */
type AuthStatusResolution =
  | { determined: true; status: ClaudeAuthStatus }
  | { determined: false };

async function runClaudeAuthStatus(workingDir?: string): Promise<AuthStatusResolution> {
  try {
    // execAuthed so the reported login state reflects the same credentials the chat spawn
    // uses (inherited OAuth tokens stripped identically); env-provided API keys are kept.
    const { stdout } = await Claude.execAuthed(['auth', 'status'], workingDir, { timeout: 8000 });
    const status = parseAuthStatus(stdout);
    return status ? { determined: true, status } : { determined: false };
  } catch (err) {
    // A logged-out account exits non-zero yet still prints `{"loggedIn":false}`;
    // runExecFile preserves that stdout on the error. Parse it → authoritative.
    // No parseable stdout (timeout / spawn error) → undetermined.
    const stdout = (err as { stdout?: string })?.stdout ?? '';
    const status = parseAuthStatus(stdout);
    return status ? { determined: true, status } : { determined: false };
  }
}

export async function getAccountHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  // Resolve this context's CLAUDE_CONFIG_DIR onto process.env so `auth status` reports
  // the profile for the active workingDir (project > global), matching chat. Only when a
  // workingDir is supplied — otherwise keep the already-active context. (#123)
  const workingDir = (message.payload as { workingDir?: string })?.workingDir;
  if (workingDir) await Claude.applyConfigDir(workingDir);

  const resolution = await runClaudeAuthStatus(workingDir);

  if (!resolution.determined) {
    // Undetermined (timeout / spawn error / unparseable output) — NOT a definitive
    // logout. Report an error so the webview keeps its last known auth state rather
    // than flipping to "logged out" and bouncing to the login page. (#178)
    connections.sendTo(connectionId, MessageType.ACK, {
      requestId: message.requestId,
      status: 'error',
      error: 'Could not determine Claude Code login status (auth status check failed).',
    });
    return;
  }

  // Determined: `loggedIn` is authoritative whether true or false.
  connections.sendTo(connectionId, MessageType.ACK, {
    requestId: message.requestId,
    status: 'ok',
    account: resolution.status,
  });
}
