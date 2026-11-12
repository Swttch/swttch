// webview/src/api/bridge/WebSocketConnector.ts

import type { Connector, RawMessageHandler, ConnectionChangeHandler } from './Connector';
import { detectRuntime, isJetBrains } from '../../config/environment';
import { LongPollSocket } from './LongPollSocket';
import {
  authSubprotocols,
  getAuthToken,
  ensureAuthTokenReady,
  hasPairCode,
  getPairingStatus,
  persistValidatedToken,
  isRemoteBlocked,
} from './authToken';
import { resolvePanelId } from './resolvePanelId';
import { MessageType } from '@/shared';

/**
 * Backend beats missed before this page calls its socket dead.
 *
 * Mirrors the backend's own tolerance (backend/src/ws/connection-heartbeat.ts):
 * three silent rounds, so at the backend's default 30s beat the page waits a
 * minute and a half before giving up on a socket. Being slow costs a late
 * reconnect; being hasty costs a reconnect the user did not need.
 */
const HEARTBEAT_MISSES_BEFORE_STALE = 3;

/**
 * Reconnect attempts in a row that must fail before this page tells the IDE.
 *
 * The page retries on its own, forever, and that mends nearly every break, so the IDE is not
 * told at the first failure: a report that early would act on a break the page is about to
 * mend itself. A run this long means the page's own retries are not working. The count starts
 * over after each report, so the IDE hears again for as long as the page stays cut off.
 */
const FAILED_ATTEMPTS_BEFORE_REPORT = 5;

/**
 * How long a WebSocket may stay in CONNECTING before this page counts the attempt as failed.
 *
 * Some browsers fail a blocked WebSocket at once; others leave it hanging with neither an `open`
 * nor a `close` (observed in IntelliJ 2026.3 Remote Development, #582). Without a limit the
 * second kind never reaches the fallback below, because nothing ever tells the page it failed.
 */
const WEBSOCKET_OPEN_TIMEOUT_MS = 6_000;

/**
 * WebSocket attempts in a row that must never open before the page moves to long-polling.
 *
 * One is not enough: a backend that is still booting, or one slow handshake, would move the page
 * to the slower transport for no reason. Being slow to switch costs a few seconds of "connecting";
 * switching without cause costs the page its WebSocket.
 */
const WEBSOCKET_FAILURES_BEFORE_FALLBACK = 2;

/** How long the HTTP probe that precedes the switch waits for the backend to answer. */
const HTTP_PROBE_TIMEOUT_MS = 5_000;

export class WebSocketConnector implements Connector {
  private ws: WebSocket | null = null;
  private connected = false;
  private isConnecting = false;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private messageHandlers = new Set<RawMessageHandler>();
  private connectionChangeHandlers = new Set<ConnectionChangeHandler>();
  private disposed = false;
  /**
   * When anything last arrived on the current socket, and the watchdog reading
   * it. A socket whose return path has died stays `readyState === OPEN` here —
   * nothing tells the page, and every hook that would end a turn waits for
   * events that can no longer arrive (issue #479). Silence is the only evidence
   * available, so it is measured.
   *
   * The watchdog is armed ONLY after the first HEARTBEAT arrives. A backend that
   * does not send them (an older standalone runtime) is quiet by design, and
   * mistaking that for a dead socket would drop a perfectly good connection
   * every couple of minutes.
   */
  private lastFrameAt = 0;
  private livenessTimer: ReturnType<typeof setInterval> | null = null;
  /** Connection attempts in a row that ended without the socket ever opening. */
  private failedAttempts = 0;
  /**
   * How the control channel travels. Starts as a WebSocket and moves to long-polling only when
   * [handleSocketNeverOpened] sees WebSockets fail to open here, and goes back to a WebSocket
   * as soon as the long-poll connection that was working ends (see [leaveLongPoll]).
   */
  private transport: 'websocket' | 'long-poll' = 'websocket';
  /**
   * A real WebSocket has opened on this page. From then on a WebSocket is known to work here, so
   * a later failure to open is an ordinary outage (backend restarting, network gone) and never a
   * reason to move to long-polling.
   */
  private everOpened = false;
  /** WebSocket attempts in a row that never opened. Reset whenever one opens. */
  private webSocketFailuresInARow = 0;
  /**
   * The long-poll connection that was working just ended, so the next attempt is a WebSocket
   * again: the cause that forced long-polling may be gone. If that attempt does not open, the page
   * goes straight back to long-polling instead of counting failures from scratch.
   */
  private returningFromLongPoll = false;
  /** Gives up on a WebSocket that stays in CONNECTING (see [WEBSOCKET_OPEN_TIMEOUT_MS]). */
  private openTimer: ReturnType<typeof setTimeout> | null = null;

  get isConnected(): boolean {
    return this.connected;
  }

  async connect(): Promise<void> {
    if (this.connected || this.isConnecting) return;
    this.disposed = false;

    return new Promise<void>((resolve, reject) => {
      this.connectInternal(resolve, reject);
    });
  }

  private connectInternal(
    onFirstConnect?: (value: void) => void,
    onFirstError?: (reason: Error) => void
  ): void {
    if (this.isConnecting || this.disposed) return;
    this.isConnecting = true;

    // Token acquisition may be ASYNC on the pairing path: a `?pair=` code (the
    // sole production delivery, for both local and remote clients) must be
    // exchanged for the real token at POST /pair before we can open the control
    // channel. Await it so no socket is ever opened token-less. When a validated
    // token is already cached (sessionStorage) or in dev, this resolves
    // synchronously-fast.
    ensureAuthTokenReady()
      .then((token) => {
        if (this.disposed) {
          this.isConnecting = false;
          return;
        }
        // Remote pairing failed (code expired/locked/unreachable): don't open a
        // doomed socket and don't spin a silent 401 reconnect loop — the UI
        // surfaces a "rescan the QR" state driven by the pairing status.
        if (!token && hasPairCode() && getPairingStatus().state === 'failed') {
          this.isConnecting = false;
          onFirstError?.(new Error('Remote pairing failed'));
          onFirstError = undefined;
          onFirstConnect = undefined;
          this.keepTryingInsideTheIde();
          return;
        }
        // Unpaired remote device (tunnel URL, no ?pair= code, no stored token):
        // definitively forbidden. Don't hammer /ws with 401s — the ForbiddenNotice
        // shows a hard "403" block instead.
        if (!token && isRemoteBlocked()) {
          this.isConnecting = false;
          onFirstError?.(new Error('Forbidden: unpaired remote device'));
          onFirstError = undefined;
          onFirstConnect = undefined;
          this.keepTryingInsideTheIde();
          return;
        }
        this.openSocket(onFirstConnect, onFirstError);
      })
      .catch(() => {
        // ensureAuthTokenReady never rejects, but guard defensively.
        this.isConnecting = false;
        this.noteFailedAttempt();
        this.scheduleReconnect();
      });
  }

  private openSocket(
    onFirstConnect?: (value: void) => void,
    onFirstError?: (reason: Error) => void
  ): void {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const env = detectRuntime();
    // panelId identifies this webview's panel so the backend can route
    // panel-scoped events (e.g. NATIVE_DROP, editor-context) back to the exact
    // webview. In JCEF it comes from the URL (`?panelId=UUID`, embedded by
    // ClaudeCodePanel); in the browser resolvePanelId mints a stable per-tab id.
    const panelId = resolvePanelId();
    const panelParam = panelId ? `&panelId=${encodeURIComponent(panelId)}` : '';
    const wsUrl = `${protocol}//${window.location.host}/ws?env=${env}${panelParam}`;
    console.log('[WebSocketConnector] Connecting to:', wsUrl);

    // Carry the per-launch auth token as the `ccg-auth` subprotocol so the
    // backend's upgrade handler accepts the control channel (Phase 1 requires it).
    // Once WebSockets are known to be blocked for this page, the same channel
    // runs over long-polling instead; LongPollSocket is shaped like a WebSocket,
    // so everything below drives either one.
    const ws =
      this.transport === 'long-poll'
        ? (new LongPollSocket(
            `${window.location.protocol}//${window.location.host}`,
            `env=${env}${panelParam}`,
            getAuthToken(),
          ) as unknown as WebSocket)
        : new WebSocket(wsUrl, authSubprotocols());
    this.ws = ws;
    let opened = false;

    // A WebSocket that neither opens nor closes would otherwise leave the page "connecting"
    // for good. Only a real WebSocket can hang like that; the long-poll transport reports its
    // own failures.
    if (this.transport === 'websocket') {
      this.armOpenTimer(ws, () => {
        // What `onerror` does for a socket that fails loudly: the first `connect()` call hears
        // about it, later attempts have nobody waiting.
        onFirstError?.(new Error('WebSocket connection timed out'));
        onFirstError = undefined;
        onFirstConnect = undefined;
      });
    }

    ws.onopen = () => {
      console.log('[WebSocketConnector] Connected');
      opened = true;
      this.clearOpenTimer();
      if (this.transport === 'websocket') {
        this.everOpened = true;
        this.webSocketFailuresInARow = 0;
        this.returningFromLongPoll = false;
      }
      this.failedAttempts = 0;
      this.isConnecting = false;
      this.connected = true;
      this.lastFrameAt = Date.now();
      // The handshake passed the backend's token gate, so this token is valid —
      // persist it (validate-then-store) so a page reload reconnects without
      // re-redeeming a pairing code (the ?pair= code is single-use / already
      // consumed). A wrong token never reaches here.
      persistValidatedToken();
      this.notifyConnectionChange(true);
      // 텔레메트리 client 식별용으로 브라우저 UA를 백엔드에 알린다(standalone 모드 의미).
      // JetBrains 모드는 CCG_CLIENT_INFO env가 우선하므로 무해하다.
      try {
        ws.send(JSON.stringify({ type: MessageType.CLIENT_INFO, payload: { userAgent: navigator.userAgent } }));
      } catch {
        // 전송 실패는 무시 — 텔레메트리는 앱 동작에 영향을 주지 않는다.
      }
      onFirstConnect?.();
      // 첫 연결 후 이후 재연결에서는 호출하지 않도록 undefined 처리
      onFirstConnect = undefined;
      onFirstError = undefined;
    };

    ws.onmessage = (event) => {
      // Anything at all proves the socket still carries traffic, so the clock
      // restarts before the payload is even looked at.
      this.lastFrameAt = Date.now();
      try {
        const message: IPCMessage = JSON.parse(event.data);
        // The backend's "still here" beat. It carries the interval it is running
        // at, and it is not application traffic, so it stops here instead of
        // being fanned out to every handler in the app.
        if (message.type === MessageType.HEARTBEAT) {
          const intervalMs = (message.payload as { intervalMs?: unknown } | undefined)?.intervalMs;
          if (typeof intervalMs === 'number' && intervalMs > 0) this.watchLiveness(intervalMs);
          // Answer it, so the backend's own liveness check never rests on a
          // WebSocket ping frame surviving every hop between us. A tunnel adds
          // hops we do not control, and a hop that forwards application data
          // while dropping control frames would make this page — sitting here
          // perfectly alive — look like the client that vanished, and take its
          // session's CLI down with it.
          if (ws.readyState === WebSocket.OPEN) {
            try {
              ws.send(JSON.stringify({ type: MessageType.HEARTBEAT, payload: {}, timestamp: Date.now() }));
            } catch {
              // Nothing to do: the next round asks again.
            }
          }
          return;
        }
        this.messageHandlers.forEach(handler => {
          try {
            handler(message);
          } catch (error) {
            console.error('[WebSocketConnector] Error in message handler:', error);
          }
        });
      } catch (error) {
        console.error('[WebSocketConnector] Error parsing message:', error);
      }
    };

    ws.onclose = () => {
      console.log('[WebSocketConnector] Disconnected');
      this.clearOpenTimer();
      this.stopLivenessWatch();
      this.isConnecting = false;
      this.ws = null;
      this.connected = false;
      this.notifyConnectionChange(false);
      if (!opened) {
        this.handleSocketNeverOpened();
      } else {
        this.leaveLongPoll();
      }

      // 자동 재연결 (disposed 되지 않은 경우만)
      this.scheduleReconnect();
    };

    ws.onerror = (error) => {
      console.error('[WebSocketConnector] Error:', error);
      this.isConnecting = false;
      if (onFirstError) {
        onFirstError(new Error('WebSocket connection error'));
        onFirstError = undefined;
        onFirstConnect = undefined;
      }
    };
  }

  private armOpenTimer(ws: WebSocket, onGiveUp: () => void): void {
    this.clearOpenTimer();
    this.openTimer = setTimeout(() => {
      this.openTimer = null;
      // The socket opened, closed or was replaced in the meantime: nothing to give up on.
      if (this.ws !== ws || ws.readyState === WebSocket.OPEN) return;
      console.warn(
        `[WebSocketConnector] WebSocket still not open after ${WEBSOCKET_OPEN_TIMEOUT_MS / 1000}s — ` +
          'counting the attempt as failed.'
      );
      onGiveUp();
      // Same detaching as [abandonSocket]: the late `close` of a socket we gave up on must not
      // land after the next attempt is already up and schedule a second reconnect.
      ws.onopen = null;
      ws.onclose = null;
      ws.onmessage = null;
      ws.onerror = null;
      try {
        ws.close();
      } catch {
        // Already unusable; the point was to stop listening to it.
      }
      this.ws = null;
      this.isConnecting = false;
      this.handleSocketNeverOpened();
      this.scheduleReconnect();
    }, WEBSOCKET_OPEN_TIMEOUT_MS);
  }

  private clearOpenTimer(): void {
    if (this.openTimer === null) return;
    clearTimeout(this.openTimer);
    this.openTimer = null;
  }

  /**
   * A connection attempt ended without the socket ever opening (it closed first, or it sat in
   * CONNECTING until [armOpenTimer] gave up). Count it, and decide whether WebSockets are what
   * is broken here.
   *
   * The page moves to long-polling only when ALL of these hold, because the cost of moving
   * without cause is the page's WebSocket, and the cost of waiting is a few seconds:
   *  - no WebSocket has ever opened on this page ([everOpened]): a page that had one is looking
   *    at an outage, not at a browser that cannot open WebSockets;
   *  - [WEBSOCKET_FAILURES_BEFORE_FALLBACK] attempts in a row never opened;
   *  - the backend answers plain HTTP, so the backend is up and WebSockets are what fail
   *    (IntelliJ 2026.3 Remote Development proxies the panel's HTTP and fails its WebSockets, #582).
   * A page coming back from a long-poll connection that was working ([returningFromLongPoll])
   * already knows the answer from last time and goes straight back.
   */
  private handleSocketNeverOpened(): void {
    this.noteFailedAttempt();
    if (this.transport !== 'websocket' || this.everOpened) return;

    if (this.returningFromLongPoll) {
      this.returningFromLongPoll = false;
      console.warn('[WebSocketConnector] WebSocket still does not open — staying on long-polling.');
      this.transport = 'long-poll';
      return;
    }

    this.webSocketFailuresInARow += 1;
    if (this.webSocketFailuresInARow < WEBSOCKET_FAILURES_BEFORE_FALLBACK) return;

    const probe = new AbortController();
    const probeTimer = setTimeout(() => probe.abort(), HTTP_PROBE_TIMEOUT_MS);
    fetch('/version', { cache: 'no-store', signal: probe.signal }).then(
      (res) => {
        clearTimeout(probeTimer);
        // A WebSocket may have opened while the probe was in flight; then there is nothing to fix.
        if (!res.ok || this.transport !== 'websocket' || this.everOpened) return;
        console.warn(
          '[WebSocketConnector] WebSocket could not open but the backend answers HTTP — ' +
            'switching this page to long-polling.'
        );
        this.transport = 'long-poll';
      },
      () => {
        // Backend unreachable: nothing to learn about WebSockets.
        clearTimeout(probeTimer);
      }
    );
  }

  /**
   * The connection that was working has ended. If it was a long-poll one, the next attempt is a
   * WebSocket again: whatever forced long-polling (a proxy, an IDE version) may have changed, and
   * a WebSocket is the better transport when it works. If that attempt does not open, see
   * [handleSocketNeverOpened].
   *
   * A long-poll connection that never opened is not a reason to try again with a WebSocket: that
   * is the backend being down, which the ordinary retry already handles.
   */
  private leaveLongPoll(): void {
    if (this.transport !== 'long-poll') return;
    this.transport = 'websocket';
    this.returningFromLongPoll = true;
  }

  /**
   * Start (or re-size) the watchdog that gives up on a silent socket.
   *
   * Driven by the backend's beat rather than by a constant of our own: the
   * backend says how often the next one is due, and the page waits
   * [HEARTBEAT_MISSES_BEFORE_STALE] of those before concluding the socket is
   * gone. Re-arming on every beat is what lets a backend change its interval
   * without the page having to be told twice.
   */
  private watchLiveness(intervalMs: number): void {
    const deadlineMs = intervalMs * HEARTBEAT_MISSES_BEFORE_STALE;
    this.stopLivenessWatch();
    this.livenessTimer = setInterval(() => {
      if (!this.ws || this.disposed) return;
      if (Date.now() - this.lastFrameAt <= deadlineMs) return;
      console.warn(
        `[WebSocketConnector] No frame from the backend for ${Math.round(deadlineMs / 1000)}s — ` +
          'treating the socket as dead and reconnecting.'
      );
      this.abandonSocket();
    }, intervalMs);
  }

  private stopLivenessWatch(): void {
    if (this.livenessTimer === null) return;
    clearInterval(this.livenessTimer);
    this.livenessTimer = null;
  }

  /**
   * Drop a socket the backend has stopped answering on, and reconnect.
   *
   * Its handlers are detached first because `close()` on a half-open socket can
   * sit in CLOSING until the browser's own timeout: the late `onclose` would
   * then land after a new socket is already up and schedule a second reconnect
   * on top of it. Reconnecting is safe to be wrong about — the new connection
   * re-subscribes and the backend's grace period is still running — which is why
   * the page may act on suspicion here while the backend may not.
   */
  private abandonSocket(): void {
    const stale = this.ws;
    if (!stale) return;
    this.stopLivenessWatch();
    this.clearOpenTimer();
    stale.onclose = null;
    stale.onmessage = null;
    stale.onerror = null;
    try {
      stale.close();
    } catch {
      // Already unusable; the point was to stop listening to it.
    }
    this.ws = null;
    this.connected = false;
    this.isConnecting = false;
    this.notifyConnectionChange(false);
    // Detaching `onclose` above also detached the place that would have ended a long-poll
    // connection, so it is ended here.
    this.leaveLongPoll();
    this.scheduleReconnect();
  }

  /**
   * Schedule a delayed reconnect unless disposed or the remote pairing failed
   * unrecoverably (an expired/locked code can only be fixed by rescanning the
   * QR, i.e. a fresh page load — retrying token-less would just 401-loop).
   */
  private scheduleReconnect(): void {
    if (this.disposed) return;
    // Inside the IDE the page never stops: the IDE can hand it a fresh pairing by loading it
    // again, which is exactly what it does when told the page cannot connect. The two stops
    // below are for a browser, where only the user can fix the pairing.
    if (!isJetBrains()) {
      if (hasPairCode() && getPairingStatus().state === 'failed') {
        console.log('[WebSocketConnector] Remote pairing failed — not reconnecting; rescan the QR.');
        return;
      }
      if (isRemoteBlocked()) {
        console.log('[WebSocketConnector] Unpaired remote device — not reconnecting (403).');
        return;
      }
    }
    this.reconnectTimeout = setTimeout(() => {
      console.log('[WebSocketConnector] Attempting to reconnect...');
      this.connectInternal();
    }, 2000);
  }

  /**
   * An attempt the browser-side stops (failed pairing, blocked device) still counts as a failed
   * one and is tried again, but only inside the IDE; see [scheduleReconnect].
   */
  private keepTryingInsideTheIde(): void {
    if (!isJetBrains()) return;
    this.noteFailedAttempt();
    this.scheduleReconnect();
  }

  /**
   * Count one connection attempt that never opened, and tell the IDE when enough of them have
   * failed in a row. The IDE's answer is not awaited and not needed: the page goes on retrying
   * either way, and reports again after the next run of failures.
   */
  private noteFailedAttempt(): void {
    this.failedAttempts += 1;
    if (this.failedAttempts < FAILED_ATTEMPTS_BEFORE_REPORT) return;
    this.failedAttempts = 0;
    // The IDE hands the page this function when it loads it (the same channel that carries the
    // tab's activity). A browser has none, and has no IDE to tell.
    const notify = (window as unknown as Record<string, unknown>).__notifyStreamingState;
    if (typeof notify !== 'function') return;
    console.warn('[WebSocketConnector] Could not reach the backend; telling the IDE.');
    try {
      (notify as (state: string) => void)('connection-lost');
    } catch {
      // Nothing to do: the next run of failures reports again.
    }
  }

  disconnect(): void {
    this.disposed = true;
    this.stopLivenessWatch();
    this.clearOpenTimer();

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.ws) {
      this.ws.onclose = null; // 재연결 방지
      this.ws.close();
      this.ws = null;
    }

    this.isConnecting = false;
    this.connected = false;
    this.notifyConnectionChange(false);
  }

  send(message: IPCMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not connected');
    }
    this.ws.send(JSON.stringify(message));
  }

  /**
   * WebSocket OPEN 상태 대기 (이미 연결된 경우 즉시 resolve).
   * DEV 모드에서 send 전에 연결 대기용.
   */
  waitForConnection(timeout = 5000): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        resolve();
        return;
      }

      const startTime = Date.now();
      const checkInterval = setInterval(() => {
        if (this.ws?.readyState === WebSocket.OPEN) {
          clearInterval(checkInterval);
          resolve();
        } else if (Date.now() - startTime > timeout) {
          clearInterval(checkInterval);
          reject(new Error('WebSocket connection timeout'));
        }
      }, 50);
    });
  }

  /**
   * ensureReady: 연결 대기. waitForConnection()에 위임.
   * Connector 인터페이스 구현.
   */
  async ensureReady(): Promise<void> {
    if (this.connected && this.ws?.readyState === WebSocket.OPEN) return;
    await this.waitForConnection();
  }

  onMessage(handler: RawMessageHandler): () => void {
    this.messageHandlers.add(handler);
    return () => {
      this.messageHandlers.delete(handler);
    };
  }

  onConnectionChange(handler: ConnectionChangeHandler): () => void {
    this.connectionChangeHandlers.add(handler);
    return () => {
      this.connectionChangeHandlers.delete(handler);
    };
  }

  private notifyConnectionChange(connected: boolean): void {
    this.connectionChangeHandlers.forEach(handler => {
      try {
        handler(connected);
      } catch (error) {
        console.error('[WebSocketConnector] Error in connection change handler:', error);
      }
    });
  }
}
