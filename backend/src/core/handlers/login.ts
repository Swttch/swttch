import type { ChildProcess } from 'child_process';
import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { Claude } from '../claude';
import { MessageType } from '../../shared';

// In-flight `claude auth login` processes, keyed by the webview connection that
// started them. Kept so a later SUBMIT_LOGIN_CODE message can write the pasted
// OAuth code to the right process's stdin. Issue #57.
const activeLoginChildren = new Map<string, ChildProcess>();

// CSI escape sequences (colors, cursor moves). The CLI's login screen is an Ink
// (terminal) UI, so its output is peppered with these — they must be stripped
// before matching or they get absorbed into the URL.
const ANSI_PATTERN = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;
// Punctuation/brackets/quotes the URL may be wrapped in or followed by in prose
// ("(https://…)", 'visit "https://…".'). Stripped only from the tail.
const TRAILING_PUNCTUATION = /[)\]}>.,;:!?'"`]+$/;
const OAUTH_URL_PATTERN = /https:\/\/[^\s]*\/oauth\/authorize[^\s]*/;

/**
 * Pull the OAuth authorize URL out of a chunk of CLI output, tolerating the ANSI
 * codes Ink emits and any surrounding prose punctuation. Returns null when the
 * text has no such URL. Exported for testing.
 */
export function extractOAuthUrl(text: string): string | null {
  const clean = text.replace(ANSI_PATTERN, '');
  const match = clean.match(OAUTH_URL_PATTERN);
  if (!match) return null;
  return match[0].replace(TRAILING_PUNCTUATION, '');
}

export async function loginHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  // Kept for the shared handler signature (handlers/index.ts dispatches all
  // handlers with the same args); login no longer opens URLs through the bridge.
  _bridge: Bridge,
): Promise<void> {
  // `auth login` WRITES the credential, into whatever directory CLAUDE_CONFIG_DIR names at
  // the moment it runs. process.env holds one such value for the whole backend, so without
  // this the login could be saved into a directory belonging to whichever project happened
  // to load last — and the user would sign in successfully and still look signed out.
  //
  // Done here rather than inside `Claude.spawn` because that one is synchronous and cannot
  // await. `spawnAuthed` covers every other spawn; this handler cannot use it, since
  // `auth login` is meant to re-authenticate rather than reuse the stripped credentials.
  const workingDir = (message.payload as { workingDir?: string } | undefined)?.workingDir;
  await Claude.applyConfigDir(workingDir);

  return new Promise((resolve) => {
    // Map the webview-selected login method to the CLI flag. The default
    // (`claude auth login` with no flag) is the Claude subscription flow, so an
    // unknown/missing method falls back to --claudeai. Previously the method was
    // dropped entirely, so "Anthropic Console" always ran the subscription flow.
    const method = message.payload?.method as string | undefined;
    const methodFlag = method === 'console' ? '--console' : '--claudeai';

    // stdin stays open ('pipe') so we can feed back the OAuth code the user pastes
    // after signing in (see submitLoginCode).
    const child = Claude.spawn(['auth', 'login', methodFlag], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    activeLoginChildren.set(connectionId, child);

    let buf = '';
    let urlForwarded = false;
    const scan = (chunk: Buffer): void => {
      buf += chunk.toString();

      // The CLI always prints the OAuth URL with an "If the browser didn't open,
      // visit:" notice, and — where it can — opens the browser ITSELF (macOS
      // `open`, Windows `rundll32`, WSL via the Windows registry). It does NOT tell
      // us through stdout whether that auto-open succeeded, so we must not open the
      // URL ourselves: on macOS/Windows that double-opens (claude's tab + ours).
      // Instead we forward the URL to the webview, which presents it and lets the
      // user open it — covering the environments where claude can't (e.g. WSL with
      // appendWindowsPath=false, no registry access). Issue #57.
      //
      // We deliberately do NOT try to detect "a code is needed" from the output:
      // the CLI unconditionally prints "Paste code here if prompted >" in EVERY
      // flow (verified on Windows and WSL — identical output and identical OAuth
      // URL). Whether a pasted code is actually required depends on whether the
      // browser's callback page can reach claude's local loopback server, decided
      // browser-side and never surfaced in the CLI output. So the webview shows the
      // code field only when the user reveals it (they only have a code when their
      // browser actually handed them one). Issue #57.
      if (!urlForwarded) {
        const url = extractOAuthUrl(buf);
        if (url) {
          urlForwarded = true;
          console.error('[login] OAuth URL available, forwarding to webview:', url);
          connections.sendTo(connectionId, MessageType.LOGIN_URL_AVAILABLE, {
            requestId: message.requestId,
            url,
          });
        }
      }
    };
    child.stdout?.on('data', scan);
    child.stderr?.on('data', scan);

    const cleanup = (): void => {
      if (activeLoginChildren.get(connectionId) === child) {
        activeLoginChildren.delete(connectionId);
      }
    };

    child.on('close', (code) => {
      cleanup();
      connections.sendTo(connectionId, MessageType.ACK, {
        requestId: message.requestId,
        status: code === 0 ? 'ok' : 'error',
        ...(code !== 0 && { error: 'Login failed or cancelled' }),
      });
      resolve();
    });

    child.on('error', (err) => {
      cleanup();
      connections.sendTo(connectionId, MessageType.ACK, {
        requestId: message.requestId,
        status: 'error',
        error: err.message,
      });
      resolve();
    });
  });
}

/**
 * Feed the OAuth code the user pasted in the webview to the in-flight
 * `claude auth login` process for [connectionId]. Returns false when there is no
 * such process or its stdin is no longer writable. Issue #57.
 */
export function submitLoginCode(connectionId: string, code: string): boolean {
  const child = activeLoginChildren.get(connectionId);
  if (!child?.stdin?.writable) return false;
  child.stdin.write(code.trim() + '\n');
  return true;
}

/**
 * Kill the in-flight `claude auth login` process for [connectionId], if any, and
 * forget it. Called when the webview connection drops: an interactive login that
 * is still waiting on stdin (e.g. the "paste code" prompt) never closes on its
 * own, so without this it would linger as a zombie. Returns false when there was
 * no such process.
 */
export function cancelLogin(connectionId: string): boolean {
  const child = activeLoginChildren.get(connectionId);
  if (!child) return false;
  activeLoginChildren.delete(connectionId);
  child.kill();
  return true;
}
