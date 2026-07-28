import type { Bridge } from './bridge-interface';
import type { WebSocket } from 'ws';
import { extractRoutingPath, selectRpcClientIndex } from './rpc-routing';
import { readSettingsFile, readMergedSettings } from '../core/features/settings';
import { MessageType } from '../shared';

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string;
  method: string;
  params: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string;
  result?: Record<string, unknown>;
  error?: { code: number; message: string };
}

interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params: Record<string, unknown>;
}

export type NotificationHandler = (method: string, params: Record<string, unknown>) => void;

interface PendingRequest {
  resolve: (value: Record<string, unknown>) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Bridge that communicates with IDE hosts via WebSocket JSON-RPC.
 *
 * IDE connects to /rpc WebSocket endpoint; this bridge sends JSON-RPC requests
 * to connected IDE clients and receives responses.
 *
 * Unlike the old stdio-based approach, WebSocket allows reconnection —
 * if the IDE restarts, it can reconnect to the already-running backend.
 */
export class JetBrainsBridge implements Bridge {
  private idCounter = 0;
  private pendingRequests = new Map<string, PendingRequest>();
  private rpcClients = new Set<WebSocket>();
  // Project roots each IDE client serves, used to route cross-IDE requests.
  // An entry is added on REGISTER_PROJECT_ROOTS and removed when the socket closes.
  private clientRoots = new Map<WebSocket, string[]>();
  private notificationHandlers = new Map<string, NotificationHandler>();

  onNotification(method: string, handler: NotificationHandler): void {
    this.notificationHandlers.set(method, handler);
  }

  addRpcClient(ws: WebSocket): void {
    this.rpcClients.add(ws);
    console.error('[node-backend]', 'RPC client connected');

    // Push the current hostMode to the freshly connected IDE. The backend is the
    // single source of truth for settings; on WSL2 the IDE-side JVM home and the
    // Linux home diverge, so Kotlin cannot read the settings file reliably and would
    // otherwise fall back to EDITOR_TAB (issue #7). Read it from the same file the
    // webview writes through, then notify just this socket. Fire-and-forget — a read
    // failure must not break RPC client registration.
    readSettingsFile()
      .then((settings) => {
        const hostMode = typeof settings.hostMode === 'string' ? settings.hostMode : 'editor-tab';
        this.pushHostMode(hostMode, ws);
      })
      .catch((err) => {
        console.error('[node-backend]', 'Failed to push hostMode on RPC connect:', err);
      });

    ws.on('message', (data: Buffer) => {
      const trimmed = data.toString().trim();
      if (!trimmed) return;

      let parsed: JsonRpcResponse | JsonRpcNotification;
      try {
        parsed = JSON.parse(trimmed) as JsonRpcResponse | JsonRpcNotification;
      } catch {
        console.error('[node-backend]', 'Failed to parse JSON-RPC message:', trimmed);
        return;
      }

      // Notification (Kotlin → Node, no id): dispatch to registered handler.
      if (!('id' in parsed) || !parsed.id) {
        const notification = parsed as JsonRpcNotification;
        // Built-in: an IDE advertising the project roots it serves. Handled here
        // (not via notificationHandlers) because it is bound to *this* socket.
        if (notification.method === MessageType.REGISTER_PROJECT_ROOTS) {
          const roots = parseProjectRoots(notification.params);
          this.clientRoots.set(ws, roots);
          // Now that we know which project this IDE serves, re-push hostMode using
          // the *merged* value. The connect-time push above could only read the
          // global file — the roots had not been announced yet — so a project that
          // overrides hostMode would otherwise never reach the IDE (issue #7).
          this.pushMergedHostMode(ws, roots[0]);
          return;
        }
        const handler = this.notificationHandlers.get(notification.method);
        if (handler) {
          handler(notification.method, notification.params ?? {});
        } else {
          console.error('[node-backend]', `No handler for JSON-RPC notification: ${notification.method}`);
        }
        return;
      }

      // Response to one of our outgoing requests.
      const response = parsed as JsonRpcResponse;
      const pending = this.pendingRequests.get(response.id);
      if (!pending) return;

      clearTimeout(pending.timer);
      this.pendingRequests.delete(response.id);

      if (response.error) {
        pending.reject(new Error(`JSON-RPC error ${response.error.code}: ${response.error.message}`));
      } else {
        pending.resolve(response.result ?? {});
      }
    });

    ws.on('close', () => {
      this.rpcClients.delete(ws);
      this.clientRoots.delete(ws);
      console.error('[node-backend]', 'RPC client disconnected');
    });
  }

  /**
   * Whether at least one IDE host RPC client is currently connected and open.
   * Lets the handler layer route a browser client's `openFile` to the IDE when
   * one is attached (jump-to-line in the editor) instead of the OS opener.
   */
  isConnected(): boolean {
    return [...this.rpcClients].some((ws) => ws.readyState === 1);
  }

  /**
   * Pick the RPC client for an outgoing request. When several IDE hosts share
   * this backend, [routingPath] (a file path or workingDir) selects the client
   * whose registered project root best matches. Falls back to the first open
   * client when there is no path or no match — preserving single-IDE behaviour.
   */
  private getRpcClient(routingPath?: string): WebSocket | null {
    const clients = [...this.rpcClients];
    const idx = selectRpcClientIndex(
      clients.map((ws) => ({ roots: this.clientRoots.get(ws) ?? [], isOpen: ws.readyState === 1 })),
      routingPath,
    );
    return idx >= 0 ? clients[idx] : null;
  }

  private request(method: string, params: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    return new Promise<Record<string, unknown>>((resolve, reject) => {
      const client = this.getRpcClient(extractRoutingPath(params));
      console.error('[node-backend]', `[DEBUG:bridge.request] method=${method}, rpcClients.size=${this.rpcClients.size}, client=${client ? `readyState=${client.readyState}` : 'null'}`);
      if (!client) {
        reject(new Error(`No RPC client connected — cannot send JSON-RPC request "${method}"`));
        return;
      }

      const id = `rpc-${++this.idCounter}`;

      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`JSON-RPC request ${method} (id=${id}) timed out after ${REQUEST_TIMEOUT_MS}ms`));
      }, REQUEST_TIMEOUT_MS);

      this.pendingRequests.set(id, { resolve, reject, timer });

      const request: JsonRpcRequest = {
        jsonrpc: '2.0',
        id,
        method,
        params,
      };

      console.error('[node-backend]', `[DEBUG:bridge.request] sending: ${redactRpcLog(request)}`);
      client.send(JSON.stringify(request) + '\n');
    });
  }

  /**
   * Send a JSON-RPC notification (no id, so no response is expected) to one IDE
   * client, or broadcast it to every connected client when [target] is omitted.
   * Used for Node→Kotlin state pushes that don't need an answer.
   */
  private notify(method: string, params: Record<string, unknown>, target?: WebSocket): void {
    const notification: JsonRpcNotification = { jsonrpc: '2.0', method, params };
    const payload = JSON.stringify(notification) + '\n';
    const clients = target ? [target] : [...this.rpcClients];
    for (const client of clients) {
      if (client.readyState !== 1) continue;
      client.send(payload);
    }
  }

  /**
   * Push the current `hostMode` (`editor-tab` | `tool-window`) to the IDE so Kotlin
   * can cache it and route chat windows synchronously. The backend is the single
   * source of truth for settings (CLAUDE.md), so Kotlin no longer reads the settings
   * file for hostMode — it relies on this push (on RPC connect and on every hostMode
   * save). Pass [target] to address one socket; omit it to reach all IDEs. See #7.
   */
  pushHostMode(hostMode: string, target?: WebSocket): void {
    this.notify(MessageType.HOST_MODE_CHANGED, { hostMode }, target);
  }

  /**
   * Push a saved `hostMode` to the IDE windows that serve [projectPath].
   *
   * A project-scoped save must not reach unrelated projects: flipping the chat
   * host in a window the user never touched is exactly the "my setting changed
   * by itself" symptom of issue #7. With no [projectPath] (a global save) every
   * client is addressed, as before.
   */
  pushHostModeForProject(hostMode: string, projectPath?: string): void {
    if (!projectPath) {
      this.pushHostMode(hostMode);
      return;
    }
    for (const ws of this.rpcClients) {
      if ((this.clientRoots.get(ws) ?? []).includes(projectPath)) {
        this.pushHostMode(hostMode, ws);
      }
    }
  }

  /**
   * Read the effective (global + project) hostMode and push it to one socket.
   * Fire-and-forget: a settings read failure must never break RPC handling.
   */
  private pushMergedHostMode(ws: WebSocket, projectPath?: string): void {
    if (!projectPath) return;
    readMergedSettings(projectPath)
      .then(({ settings }) => {
        const hostMode = typeof settings.hostMode === 'string' ? settings.hostMode : 'editor-tab';
        this.pushHostMode(hostMode, ws);
      })
      .catch((err) => {
        console.error('[node-backend]', 'Failed to push merged hostMode:', err);
      });
  }

  async openFile(path: string, line?: number, column?: number): Promise<void> {
    await this.request(MessageType.OPEN_FILE, { path, line, column });
  }

  async openDiff(params: {
    filePath: string;
    oldContent: string;
    newContent: string;
    toolUseId?: string;
  }): Promise<void> {
    await this.request(MessageType.OPEN_DIFF, params);
  }

  async applyDiff(params: {
    filePath: string;
    newContent: string;
    toolUseId?: string;
  }): Promise<{ applied: boolean }> {
    const result = await this.request(MessageType.APPLY_DIFF, params);
    return { applied: result['applied'] === true };
  }

  async rejectDiff(params: { toolUseId?: string }): Promise<void> {
    await this.request(MessageType.REJECT_DIFF, params ?? {});
  }

  async refreshFiles(params: { paths: string[] }): Promise<void> {
    await this.request(MessageType.REFRESH_FILES, { paths: params.paths });
  }

  async createSession(workingDir?: string): Promise<void> {
    await this.request(MessageType.CREATE_SESSION, workingDir ? { workingDir } : {});
  }

  async openNewTab(workingDir?: string): Promise<void> {
    await this.request(MessageType.OPEN_NEW_TAB, workingDir ? { workingDir } : {});
  }

  async openSession(sessionId: string, workingDir?: string): Promise<void> {
    const params: Record<string, unknown> = { sessionId };
    if (workingDir) params.workingDir = workingDir;
    await this.request(MessageType.OPEN_SESSION, params);
  }

  async openSettings(workingDir?: string, path?: string): Promise<void> {
    const params: Record<string, unknown> = {};
    if (workingDir) params.workingDir = workingDir;
    if (path) params.path = path;
    await this.request(MessageType.OPEN_SETTINGS, params);
  }

  async openTerminal(workingDir: string): Promise<void> {
    await this.request(MessageType.OPEN_TERMINAL, { workingDir });
  }

  async openUrl(url: string): Promise<void> {
    await this.request(MessageType.OPEN_URL, { url });
  }

  async pickFiles(options: {
    mode: 'files' | 'folders' | 'both';
    multiple?: boolean;
  }): Promise<{ paths: string[] }> {
    const result = await this.request(MessageType.PICK_FILES, options as unknown as Record<string, unknown>);
    const paths = result['paths'];
    return { paths: Array.isArray(paths) ? (paths as string[]) : [] };
  }

  async updatePlugin(): Promise<void> {
    await this.request(MessageType.UPDATE_PLUGIN, {});
  }

  async requiresRestart(): Promise<boolean> {
    const result = await this.request(MessageType.REQUIRES_RESTART, {});
    return result['requiresRestart'] === true;
  }

  async getIdeRoot(workingDir?: string): Promise<string | null> {
    const result = await this.request(MessageType.GET_IDE_ROOT, workingDir ? { workingDir } : {});
    const ideRoot = result['ideRoot'];
    return typeof ideRoot === 'string' && ideRoot.length > 0 ? ideRoot : null;
  }
}

/**
 * Extract the `roots` string array from a REGISTER_PROJECT_ROOTS notification's
 * params, dropping any non-string entries. Returns [] when absent or malformed.
 */
export function parseProjectRoots(params: Record<string, unknown> | undefined): string[] {
  const roots = params?.['roots'];
  if (!Array.isArray(roots)) return [];
  return roots.filter((r): r is string => typeof r === 'string' && r.length > 0);
}

/**
 * Serialize a JSON-RPC request for the debug log with bootstrap credentials
 * masked. A single-use pairing code rides inside OPEN_URL's `params.url` as
 * `?pair=<code>` — the credential the webview redeems for the stable control-channel
 * token. Logging it verbatim would let anyone who can read the process logs
 * (idea.log / stdout) redeem it first and hijack the token — the same class of
 * secret leak that #208 closes for argv, via the log channel instead. Mirrors the
 * Kotlin-side `pair=<redacted>` masking in ClaudeCodePanel's URL log. `token` is
 * masked too as defense in depth.
 */
export function redactRpcLog(request: JsonRpcRequest): string {
  return JSON.stringify(request).replace(/([?&](?:pair|token)=)[^"&\\]+/gi, '$1<redacted>');
}
