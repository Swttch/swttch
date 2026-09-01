import type { WebSocket } from 'ws';
import type { ChildProcess } from 'child_process';
import type { IPCMessage, NativeDropEntry } from '../core/types';
import { ClientEnv, MessageType } from '../shared';
import { disableIdleShutdown } from '../config/environment';
import { Claude } from '../core/claude';

const SESSION_CLEANUP_GRACE_MS = 30_000;
const IDLE_SHUTDOWN_GRACE_MS = 60_000;
/**
 * How long an editor-context payload stays valid while waiting for a webview to
 * connect. The "Add to Claude" action can fire before the JCEF panel has opened
 * its /ws socket (cold start); we stash the payload and replay it to the first
 * connection that arrives, but only within this window so a stale selection from
 * minutes ago is never injected.
 */
const PENDING_EDITOR_CONTEXT_TTL_MS = 10_000;

/** Push message type carrying the IDE editor selection to the webview. */
export const EDITOR_CONTEXT_MESSAGE = MessageType.EDITOR_CONTEXT;

/**
 * Push message type carrying the auto-tracked IDE selection to the webview.
 * Mirrors EDITOR_CONTEXT_MESSAGE but for the passive selection channel. Defined
 * here (not in ide-selection-route) so addConnection can replay the last
 * selection on connect — symmetric with how editor-context replays here.
 */
export const IDE_SELECTION_MESSAGE = MessageType.IDE_SELECTION;

interface PendingEditorContext {
  payload: Record<string, unknown>;
  expiresAt: number;
}

interface SessionRecord {
  sessionId: string;
  process: ChildProcess | null;
  subscribers: Set<string>;
  buffer: string;
  workingDir: string;
  /**
   * True while a turn is in flight: set when a prompt is written to the CLI
   * stdin, cleared on the CLI `result` event (turn end) and on STREAM_END
   * (process death safety net). NOT the STREAM_START..STREAM_END window —
   * the CLI process is long-lived across turns, so that window only means
   * "process alive". Feeds the streaming-sessions counter (status endpoint,
   * future IDE exit-confirm modal).
   */
  streaming: boolean;
  /**
   * Permission mode the LIVE process was actually spawned with. `--permission-mode`
   * only applies at spawn, so a mode the user picks afterwards cannot reach a running
   * CLI — without remembering what the process is really running as, a later mode
   * change would be silently dropped and the CLI's `system/init` would push the stale
   * mode back onto the webview (#172). Null when no process has been spawned yet.
   */
  inputMode: string | null;
}

interface ClientRecord {
  subscribedSessionId: string | null;
  env: ClientEnv;
  /**
   * IDE panel that owns this webview connection (JetBrains mode only). Set from the
   * `panelId` query param that Kotlin embeds in the JCEF URL. Used to route panel-
   * scoped notifications (e.g. NATIVE_DROP) to the exact webview the user is looking
   * at, independent of sessionId which the webview generates itself.
   */
  panelId: string | null;
  /**
   * Native drop paths stashed by CefDragHandler.onDragEnter, waiting for the page-level
   * drop event to flush them. JCEF doesn't expose absolute paths on `dataTransfer` for
   * security reasons, so we receive the paths over the /rpc socket on drag-enter, hold
   * them here, and release them on NATIVE_DROP_FLUSH (which the webview fires from its
   * own `drop` handler). Cleared on flush and on disconnect.
   */
  nativeDropStash: NativeDropEntry[] | null;
  /**
   * `Origin` header of the WebSocket upgrade request, when present. Used only
   * to classify the connection type for status reporting: Remote Tunnel
   * clients arrive with a *.trycloudflare.com origin (already allowlisted by
   * ws-server's validateOrigin), local browsers with a localhost one.
   */
  origin: string | null;
}

/** Connection-count breakdown for the status endpoint / status-bar card. */
export interface ConnectionStats {
  total: number;
  /** JCEF IDE panels — connections carrying a `panelId` query param. */
  panels: number;
  /** Remote Tunnel clients — recognized by their *.trycloudflare.com origin. */
  tunnels: number;
  /** Everything else: plain (local) browsers. */
  browsers: number;
}

export class ConnectionManager {
  private connectionMap = new Map<string, WebSocket>();
  private clientMap = new Map<string, ClientRecord>();
  private sessionRegistry = new Map<string, SessionRecord>();
  private cleanupTimers = new Map<string, NodeJS.Timeout>();
  private idleShutdownTimer: NodeJS.Timeout | null = null;
  /**
   * Idle-shutdown gate ("keep backend running"). While true the backend never
   * schedules its zero-connection self-shutdown.
   *
   * The boot value comes from the constructor: a standalone backend
   * boots with the gate up and nothing ever lowers it — the operator owns the
   * process lifetime (visible terminal, Ctrl+C → graceful shutdown), so the
   * idle timer is never armed at all. In JetBrains mode the gate boots down
   * and is driven exclusively over the /rpc channel (SET_KEEP_ALIVE): Kotlin
   * pushes the desired state on every RPC (re)connect and on user toggle; the
   * parent watchdog flips it back to false when the IDE dies (keep-alive
   * clamp).
   */
  private keepAlive: boolean;
  // Secondary index for O(1) panelId → connectionId resolution. Panel ↔ connection
  // is 1:1 (one JCEF browser per IDE panel, one /ws socket per browser), so this
  // map is always in sync with the panelId stored on each ClientRecord.
  private panelIdIndex = new Map<string, string>();
  // Editor context awaiting a webview connection. Replayed to the first
  // connection that arrives within PENDING_EDITOR_CONTEXT_TTL_MS, then cleared.
  private pendingEditorContext: PendingEditorContext | null = null;
  // Last auto-tracked IDE selection. Unlike pendingEditorContext (a one-shot
  // "Add to Claude" action consumed by the first connection), this is a
  // persistent mirror of the currently-focused editor: it is peeked (not
  // consumed) and replayed to EVERY new connection so a reopened tool window /
  // reloaded webview restores the file context chip immediately, without the
  // user re-focusing the file. No TTL — kept until superseded by the next
  // selection, so restoration works no matter how long the panel was closed.
  private lastIdeSelection: Record<string, unknown> | null = null;
  // Focus-history stack of panelIds (most-recent last), reported via PANEL_FOCUSED.
  // Panel-scoped pushes (editor-context / ide-selection) route to the top — the
  // panel the user is actually looking at — and Alt+K reveal (getRevealTarget)
  // reads the top's env. DEAD panels are pruned on every push and on
  // removeConnection, so the top is always live and "the panel focused before the
  // one that just died" falls out naturally: its predecessor becomes the new top.
  // Keyed by the stable panelId (session-agnostic, covers uninitialized tabs).
  // panelIds need not be unique in the stack; pushes de-dupe only to keep it tidy.
  private lastFocusedPanelIdStack: string[] = [];
  private nextId = 0;

  constructor(initialKeepAlive = false) {
    this.keepAlive = initialKeepAlive;
  }

  // ─── Connection lifecycle ───────────────────────────────────────────────────

  addConnection(
    ws: WebSocket,
    env: ClientEnv = ClientEnv.BROWSER,
    panelId: string | null = null,
    origin: string | null = null,
  ): string {
    const connectionId = `conn-${++this.nextId}-${Date.now()}`;
    this.connectionMap.set(connectionId, ws);
    this.clientMap.set(connectionId, { subscribedSessionId: null, env, panelId, nativeDropStash: null, origin });
    if (panelId) this.panelIdIndex.set(panelId, connectionId);
    this.cancelIdleShutdown('new connection received');
    console.error(
      '[node-backend]',
      `Connection added: ${connectionId} (env: ${env}, panelId: ${panelId ?? 'none'})`,
    );

    // Replay any editor context that arrived before this webview connected
    // (e.g. "Add to Claude" fired during JCEF cold start).
    const pendingEditorContext = this.consumePendingEditorContext();
    if (pendingEditorContext) {
      this.sendTo(connectionId, EDITOR_CONTEXT_MESSAGE, pendingEditorContext);
    }

    // Replay the last IDE selection so a reopened tool window / reloaded webview
    // restores the current file context chip immediately, without the user
    // re-focusing the file. Peeked (not consumed) so every reconnection is
    // restored — this is the persistent counterpart to the one-shot replay above.
    const lastIdeSelection = this.getLastIdeSelection();
    if (lastIdeSelection) {
      this.sendTo(connectionId, IDE_SELECTION_MESSAGE, lastIdeSelection);
    }

    return connectionId;
  }

  // ─── Editor context buffer ──────────────────────────────────────────────────

  /**
   * Stash an editor-context payload to replay to the next webview connection.
   * Overwrites any earlier pending payload — only the latest selection matters.
   */
  setPendingEditorContext(payload: Record<string, unknown>): void {
    this.pendingEditorContext = {
      payload,
      expiresAt: Date.now() + PENDING_EDITOR_CONTEXT_TTL_MS,
    };
  }

  /**
   * Return the stashed editor-context payload and clear the buffer. Returns null
   * if nothing is stashed or the stash has expired (also clears in that case).
   */
  consumePendingEditorContext(): Record<string, unknown> | null {
    const pending = this.pendingEditorContext;
    this.pendingEditorContext = null;
    if (!pending) return null;
    if (Date.now() > pending.expiresAt) return null;
    return pending.payload;
  }

  // ─── Last IDE selection buffer ──────────────────────────────────────────────

  /**
   * Store the latest auto-tracked IDE selection to replay to future webview
   * connections. Overwrites any earlier value — only the current selection
   * matters. Unlike setPendingEditorContext this has no TTL and is not consumed
   * on replay: it mirrors the currently-focused editor for as long as the panel
   * stays on that file.
   */
  setLastIdeSelection(payload: Record<string, unknown>): void {
    this.lastIdeSelection = payload;
  }

  /**
   * Return the stored last IDE selection without clearing it (peek). Returns
   * null if no selection has been stored yet. Kept intact so every subsequent
   * connection (e.g. repeated tool-window reopens) is restored.
   */
  getLastIdeSelection(): Record<string, unknown> | null {
    return this.lastIdeSelection;
  }

  // ─── Last focused panel ─────────────────────────────────────────────────────

  /** Prune panelIds whose connection is gone — keeps only live panels in the stack. */
  private pruneDeadFocus(): void {
    this.lastFocusedPanelIdStack = this.lastFocusedPanelIdStack.filter((id) =>
      this.panelIdIndex.has(id),
    );
  }

  /**
   * Record the panelId whose webview just gained focus (PANEL_FOCUSED) as the new
   * top of the focus stack. Prunes dead panels and de-dupes this id first, so the
   * stack stays live and ordered most-recent-last without unbounded growth.
   */
  setLastFocusedPanelId(panelId: string): void {
    this.lastFocusedPanelIdStack = this.lastFocusedPanelIdStack.filter(
      (id) => id !== panelId && this.panelIdIndex.has(id),
    );
    this.lastFocusedPanelIdStack.push(panelId);
  }

  /**
   * The most-recently-focused LIVE panelId (top of the stack), or null if none.
   * Prunes dead panels first, so a panel that died since it was focused is skipped
   * and its still-live predecessor surfaces as the new top.
   */
  getLastFocusedPanelId(): string | null {
    this.pruneDeadFocus();
    const stack = this.lastFocusedPanelIdStack;
    return stack.length > 0 ? stack[stack.length - 1] : null;
  }

  /**
   * Decide what Kotlin should reveal on Alt+K, from the most-recently-focused LIVE
   * panel's env:
   *   - JCEF panel  → { kind: 'jcef', panelId } — focus/open that exact tab
   *   - browser tab → { kind: 'browser' } — Kotlin does nothing (the mention still
   *     routes to the browser via routeToFocusedOrBroadcast)
   *   - none live   → { kind: 'none' } — Kotlin opens a fresh tab
   */
  getRevealTarget(): { kind: 'jcef'; panelId: string } | { kind: 'browser' } | { kind: 'none' } {
    const panelId = this.getLastFocusedPanelId();
    if (!panelId) return { kind: 'none' };
    const connectionId = this.panelIdIndex.get(panelId);
    const env = connectionId ? this.clientMap.get(connectionId)?.env : undefined;
    if (env === ClientEnv.JETBRAINS) return { kind: 'jcef', panelId };
    if (env === ClientEnv.BROWSER) return { kind: 'browser' };
    return { kind: 'none' };
  }

  /**
   * Route a panel-scoped push (editor-context / ide-selection) to the LAST-FOCUSED
   * panel's webview when that panel still has a live connection; otherwise fall
   * back to broadcasting to every connection. The fallback preserves the pre-focus
   * behavior and is the safe default whenever no panel focus is known yet (cold
   * start) or the focused panel's webview has since disconnected — so a payload is
   * never silently dropped. Keyed by panelId, so it is session-agnostic.
   */
  routeToFocusedOrBroadcast(type: string, payload: Record<string, unknown> = {}): void {
    const panelId = this.getLastFocusedPanelId();
    if (panelId) {
      const connectionId = this.panelIdIndex.get(panelId);
      if (connectionId && this.connectionMap.has(connectionId)) {
        this.sendTo(connectionId, type, payload);
        return;
      }
    }
    this.broadcastToAll(type, payload);
  }

  setNativeDropStash(panelId: string, entries: NativeDropEntry[]): boolean {
    const connectionId = this.panelIdIndex.get(panelId);
    if (!connectionId) return false;
    const record = this.clientMap.get(connectionId);
    if (!record) return false;
    record.nativeDropStash = entries;
    return true;
  }

  takeNativeDropStash(connectionId: string): NativeDropEntry[] | null {
    const record = this.clientMap.get(connectionId);
    if (!record || !record.nativeDropStash) return null;
    const stash = record.nativeDropStash;
    record.nativeDropStash = null;
    return stash;
  }

  /**
   * Resolve a panelId (assigned by Kotlin on JCEF browser creation) back to its
   * webview connection. Panel ↔ connection is 1:1 since each panel hosts one
   * JCEF browser that opens one /ws socket.
   */
  getConnectionIdByPanelId(panelId: string): string | null {
    return this.panelIdIndex.get(panelId) ?? null;
  }

  /**
   * The panel a connection belongs to, or null for a browser client that never
   * carried one.
   *
   * The reverse of [getConnectionIdByPanelId], and the reason panel-scoped
   * requests need not carry their own panelId: taking it from the connection
   * means a webview can only ever act on the panel it is, not on one it names.
   */
  getPanelIdByConnectionId(connectionId: string): string | null {
    return this.clientMap.get(connectionId)?.panelId ?? null;
  }

  /**
   * Choose the ONE tab that should deliver a due scheduled message, so the
   * message is sent exactly like a person sending it from that window (and only
   * once). Priority — closest to "the user is already there" first:
   *   1. A live tab already SUBSCRIBED to the session (the reservation's own tab
   *      first, else any subscriber) → deliver in place, no session switch.
   *   2. The reservation's own tab, if still alive but on another session →
   *      switch it to the session, then deliver.
   *   3. The most-recently-focused live tab → switch it, then deliver.
   *   4. No live tab at all → null (caller keeps the reservation for next attach).
   *
   * `needsSessionSwitch` tells the target tab whether it must load `sessionId`
   * before sending (false when it's already the tab's current session).
   */
  pickScheduledDeliveryTarget(
    sessionId: string,
    reservationPanelId?: string,
  ): { connectionId: string; needsSessionSwitch: boolean } | null {
    const session = this.sessionRegistry.get(sessionId);
    const reservationConn = reservationPanelId
      ? (this.panelIdIndex.get(reservationPanelId) ?? null)
      : null;

    // 1. Already subscribed to this session (no switch needed).
    if (session && session.subscribers.size > 0) {
      // Prefer the reservation's own tab when it's among the subscribers.
      if (reservationConn && session.subscribers.has(reservationConn)) {
        return { connectionId: reservationConn, needsSessionSwitch: false };
      }
      for (const connId of session.subscribers) {
        if (this.connectionMap.has(connId)) {
          return { connectionId: connId, needsSessionSwitch: false };
        }
      }
    }

    // 2. The reservation's own tab is alive but on another session → switch it.
    if (reservationConn && this.connectionMap.has(reservationConn)) {
      return { connectionId: reservationConn, needsSessionSwitch: true };
    }

    // 3. Fall back to the most-recently-focused live tab → switch it.
    const focusedPanelId = this.getLastFocusedPanelId();
    if (focusedPanelId) {
      const connId = this.panelIdIndex.get(focusedPanelId);
      if (connId && this.connectionMap.has(connId)) {
        return { connectionId: connId, needsSessionSwitch: true };
      }
    }

    // 4. No live tab — the reservation stays put and redelivers on next attach.
    return null;
  }

  removeConnection(connectionId: string): void {
    this.unsubscribe(connectionId);
    const record = this.clientMap.get(connectionId);
    if (record?.panelId) {
      this.panelIdIndex.delete(record.panelId);
      // The panel's connection is gone; prune it (and any other now-stale ids)
      // from the focus stack so the top surfaces the next live panel — this is
      // exactly what makes "focus the panel focused before the dead one" work.
      this.pruneDeadFocus();
    }
    this.connectionMap.delete(connectionId);
    this.clientMap.delete(connectionId);
    console.error('[node-backend]', `Connection removed: ${connectionId}`);

    if (this.connectionMap.size === 0) {
      this.scheduleIdleShutdown();
    }
  }

  // ─── Messaging ──────────────────────────────────────────────────────────────

  sendTo(connectionId: string, type: string, payload: Record<string, unknown> = {}): void {
    const ws = this.connectionMap.get(connectionId);
    if (!ws) return;

    const message: IPCMessage = {
      type,
      payload,
      timestamp: Date.now(),
    };

    try {
      if (ws.readyState === 1 /* WebSocket.OPEN */) {
        ws.send(JSON.stringify(message));
      }
    } catch {
      // send failure — will be cleaned up on disconnect
    }
  }

  broadcastToSession(
    sessionId: string,
    type: string,
    payload: Record<string, unknown> = {},
    excludeConnectionId?: string,
  ): void {
    const session = this.sessionRegistry.get(sessionId);
    if (!session) return;

    // Safety net for the turn-in-flight flag: STREAM_END fires on every CLI
    // process death path (close, spawn error, WSL mismatch), where no `result`
    // event will ever arrive to clear the flag.
    if (type === MessageType.STREAM_END) {
      session.streaming = false;
    }

    const message: IPCMessage = {
      type,
      payload,
      timestamp: Date.now(),
    };
    const data = JSON.stringify(message);

    for (const connId of session.subscribers) {
      if (connId === excludeConnectionId) continue;
      const ws = this.connectionMap.get(connId);
      if (!ws) continue;

      try {
        if (ws.readyState === 1 /* WebSocket.OPEN */) {
          ws.send(data);
        }
      } catch {
        // send failure — will be cleaned up on disconnect
      }
    }
  }

  broadcastToAll(type: string, payload: Record<string, unknown> = {}): void {
    const message: IPCMessage = {
      type,
      payload,
      timestamp: Date.now(),
    };
    const data = JSON.stringify(message);

    for (const [, ws] of this.connectionMap) {
      try {
        if (ws.readyState === 1 /* WebSocket.OPEN */) {
          ws.send(data);
        }
      } catch {
        // send failure — will be cleaned up on disconnect
      }
    }
  }

  // ─── Subscription (Pub/Sub) ─────────────────────────────────────────────────

  subscribe(
    connectionId: string,
    sessionId: string,
    /**
     * Where this session's CLI runs, when the caller knows it. Recorded on the
     * session so anything asking "which project is this?" — per-project
     * settings above all — can answer without threading it through separately.
     */
    workingDir?: string,
  ): void {
    const client = this.clientMap.get(connectionId);
    // Already subscribed to the same session — no-op
    if (client?.subscribedSessionId === sessionId) {
      return;
    }

    // Unsubscribe from any DIFFERENT session first
    this.unsubscribe(connectionId);

    const session = this.getOrCreateSession(sessionId, workingDir);
    session.subscribers.add(connectionId);
    /*
     * Recorded on every subscribe, not only on the first.
     *
     * The session record is created by whichever call reaches it first, and most
     * of those have no working directory to give — so it was left empty and
     * everything that later asked the session where it lives got nothing. That
     * is how per-project settings stopped being read for permission reviews:
     * `preparePermissionReview` looks the directory up here, got undefined, and
     * merged global settings only. Measured: `workingDir=(none)` while the
     * project had `diffSurface: "ide"` set, and the built-in diff opened anyway.
     *
     * Only ever set, never cleared: a later subscribe without one must not erase
     * what an earlier one knew.
     */
    if (workingDir && !session.workingDir) {
      session.workingDir = workingDir;
    }

    // Cancel pending cleanup if reconnecting within grace period
    const pendingTimer = this.cleanupTimers.get(sessionId);
    if (pendingTimer) {
      clearTimeout(pendingTimer);
      this.cleanupTimers.delete(sessionId);
      console.error(
        '[node-backend]',
        `Cancelled cleanup timer for session ${sessionId} (subscriber reconnected)`,
      );
    }

    if (client) {
      client.subscribedSessionId = sessionId;
    }

    console.error(
      '[node-backend]',
      `${connectionId} subscribed to session ${sessionId} (subscribers: ${session.subscribers.size})`,
    );
  }

  unsubscribe(connectionId: string): void {
    const client = this.clientMap.get(connectionId);
    if (!client?.subscribedSessionId) return;

    const sessionId = client.subscribedSessionId;
    const session = this.sessionRegistry.get(sessionId);

    if (session) {
      session.subscribers.delete(connectionId);
      console.error(
        '[node-backend]',
        `${connectionId} unsubscribed from session ${sessionId} (subscribers: ${session.subscribers.size})`,
      );

      if (session.subscribers.size === 0) {
        console.error(
          '[node-backend]',
          `Session ${sessionId} has no subscribers, scheduling cleanup in ${SESSION_CLEANUP_GRACE_MS}ms`,
        );
        const timer = setTimeout(() => {
          this.cleanupTimers.delete(sessionId);
          const currentSession = this.sessionRegistry.get(sessionId);
          if (currentSession && currentSession.subscribers.size === 0) {
            this.cleanupSession(sessionId);
          }
        }, SESSION_CLEANUP_GRACE_MS);
        this.cleanupTimers.set(sessionId, timer);
      }
    }

    client.subscribedSessionId = null;
  }

  // ─── Accessors ──────────────────────────────────────────────────────────────

  getConnectionCount(): number {
    return this.connectionMap.size;
  }

  /** Connection-count breakdown by client type (status endpoint / status-bar card). */
  getConnectionStats(): ConnectionStats {
    const stats: ConnectionStats = { total: 0, panels: 0, tunnels: 0, browsers: 0 };
    for (const record of this.clientMap.values()) {
      stats.total++;
      if (record.panelId !== null) {
        stats.panels++;
      } else if (record.origin?.endsWith('.trycloudflare.com')) {
        stats.tunnels++;
      } else {
        stats.browsers++;
      }
    }
    return stats;
  }

  getSessionCount(): number {
    return this.sessionRegistry.size;
  }

  /** Number of sessions with a turn in flight (see SessionRecord.streaming). */
  getStreamingSessionCount(): number {
    let count = 0;
    for (const session of this.sessionRegistry.values()) {
      if (session.streaming) count++;
    }
    return count;
  }

  /**
   * Flip the per-session turn-in-flight flag. claude-process sets it true
   * after writing a prompt to the CLI stdin and false on the `result` event;
   * broadcastToSession clears it on STREAM_END as the process-death safety net.
   */
  setStreaming(sessionId: string, streaming: boolean): void {
    const session = this.sessionRegistry.get(sessionId);
    if (session) session.streaming = streaming;
  }

  getClient(connectionId: string): ClientRecord | undefined {
    return this.clientMap.get(connectionId);
  }

  getClientEnv(connectionId: string): ClientEnv {
    return this.clientMap.get(connectionId)?.env ?? ClientEnv.BROWSER;
  }

  getSession(sessionId: string): SessionRecord | undefined {
    return this.sessionRegistry.get(sessionId);
  }

  /**
   * A session whose CLI is alive and writable for the given workspace, if any.
   *
   * Used to ask a running CLI something instead of spawning a new one for the
   * answer. `workingDir` has to match because MCP configuration is per-project:
   * a `.mcp.json` belongs to one workspace, so another workspace's CLI would
   * report a different set of servers.
   *
   * Returns undefined when no CLI has been spawned yet, which is the ordinary
   * state of a chat tab before its first message. Callers treat that as "ask the
   * CLI the official way instead" rather than as an error.
   */
  findLiveSessionForWorkingDir(workingDir: string): SessionRecord | undefined {
    for (const session of this.sessionRegistry.values()) {
      if (session.workingDir !== workingDir) continue;
      if (session.process?.stdin?.writable) return session;
    }
    return undefined;
  }

  getOrCreateSession(sessionId: string, workingDir?: string): SessionRecord {
    let session = this.sessionRegistry.get(sessionId);
    if (!session) {
      session = {
        sessionId,
        process: null,
        subscribers: new Set(),
        buffer: '',
        workingDir: workingDir ?? '',
        streaming: false,
        inputMode: null,
      };
      this.sessionRegistry.set(sessionId, session);
    }
    return session;
  }

  // ─── Process accessors ─────────────────────────────────────────────────────

  setProcess(sessionId: string, proc: ChildProcess | null): void {
    const session = this.getOrCreateSession(sessionId);
    session.process = proc;
    // The recorded permission mode describes the LIVE process, so it dies with it.
    // Leaving a stale mode behind would make the next spawn look like a no-op change.
    if (!proc) session.inputMode = null;
  }

  getProcess(sessionId: string): ChildProcess | null {
    return this.sessionRegistry.get(sessionId)?.process ?? null;
  }

  /** Record the permission mode the session's live CLI process was spawned with. */
  setInputMode(sessionId: string, inputMode: string | null): void {
    const session = this.getOrCreateSession(sessionId);
    session.inputMode = inputMode;
  }

  /** Permission mode the session's live CLI is actually running under, if any. */
  getInputMode(sessionId: string): string | null {
    return this.sessionRegistry.get(sessionId)?.inputMode ?? null;
  }

  setBuffer(sessionId: string, buffer: string): void {
    const session = this.sessionRegistry.get(sessionId);
    if (session) {
      session.buffer = buffer;
    }
  }

  getBuffer(sessionId: string): string {
    return this.sessionRegistry.get(sessionId)?.buffer ?? '';
  }

  // ─── Internal ───────────────────────────────────────────────────────────────

  /**
   * Kill-sweep over every live session CLI tree. shutdownAll uses it with
   * SIGTERM (graceful path); the process 'exit' hook in server.ts uses it with
   * SIGKILL as the last-resort orphan guard, so it must stay synchronous —
   * 'exit' handlers cannot await.
   */
  killAllSessionProcesses(signal: NodeJS.Signals): number {
    let killed = 0;
    for (const session of this.sessionRegistry.values()) {
      if (session.process) {
        Claude.killTree(session.process, signal);
        killed++;
      }
    }
    return killed;
  }

  shutdownAll(): void {
    // Clear all pending cleanup timers
    for (const timer of this.cleanupTimers.values()) {
      clearTimeout(timer);
    }
    this.cleanupTimers.clear();

    this.cancelIdleShutdown('shutting down');

    const killedSessions = this.killAllSessionProcesses('SIGTERM');
    let closedConnections = 0;

    for (const ws of this.connectionMap.values()) {
      ws.close();
      closedConnections++;
    }

    this.sessionRegistry.clear();
    this.connectionMap.clear();
    this.clientMap.clear();
    this.panelIdIndex.clear();
    this.lastFocusedPanelIdStack = [];

    console.error(
      '[node-backend]',
      `Shutdown: killed ${killedSessions} session(s), closed ${closedConnections} connection(s)`,
    );
  }

  /**
   * Toggle the idle-shutdown gate. Enabling cancels any armed timer. Disabling
   * restores the normal regime — and, when there are no /ws connections at that
   * moment, arms the timer immediately: removeConnection() only fires on a
   * connection that existed, so a backend that never received one (eager start,
   * prewarm) would otherwise linger forever.
   */
  setKeepAlive(enabled: boolean): void {
    // No early return on an unchanged value: the initial state is false, yet the
    // very first SET_KEEP_ALIVE(false) push must still arm the timer below when
    // the backend has no /ws connections (the eager-start/prewarm case).
    if (this.keepAlive !== enabled) {
      console.error('[node-backend]', `Keep-alive ${enabled ? 'enabled' : 'disabled'}`);
    }
    this.keepAlive = enabled;

    if (enabled) {
      this.cancelIdleShutdown('keep-alive enabled');
    } else if (this.connectionMap.size === 0) {
      this.scheduleIdleShutdown();
    }
  }

  isKeepAlive(): boolean {
    return this.keepAlive;
  }

  private scheduleIdleShutdown(): void {
    if (this.keepAlive) return;
    if (this.idleShutdownTimer !== null) return;
    // Dev/testing escape hatch: a standalone `pnpm dev` backend has no respawner,
    // so idle shutdown would kill it whenever the browser disconnects briefly.
    if (disableIdleShutdown) return;

    console.error(
      '[node-backend]',
      `No active connections. Idle shutdown scheduled in ${IDLE_SHUTDOWN_GRACE_MS}ms`,
    );
    this.idleShutdownTimer = setTimeout(() => {
      console.error('[node-backend]', 'Idle shutdown grace period elapsed. Shutting down.');
      // The timer has fired — null it out so shutdownAll()'s cancelIdleShutdown()
      // no-ops instead of logging a misleading "timer cancelled" line.
      this.idleShutdownTimer = null;
      this.shutdownAll();
      process.exit(0);
    }, IDLE_SHUTDOWN_GRACE_MS);
  }

  private cancelIdleShutdown(reason: string): void {
    if (this.idleShutdownTimer === null) return;

    clearTimeout(this.idleShutdownTimer);
    this.idleShutdownTimer = null;
    console.error('[node-backend]', `Idle shutdown timer cancelled (${reason})`);
  }

  private cleanupSession(sessionId: string): void {
    const session = this.sessionRegistry.get(sessionId);
    if (!session) return;

    if (session.process) {
      console.error(
        '[node-backend]',
        `Killing process for session ${sessionId} (PID: ${session.process.pid})`,
      );
      Claude.killTree(session.process);
      session.process = null;
    }

    this.sessionRegistry.delete(sessionId);
    console.error('[node-backend]', `Session ${sessionId} cleaned up`);
  }
}
