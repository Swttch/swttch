// webview/src/api/bridge/WebSocketConnector.ts

import type { Connector, RawMessageHandler, ConnectionChangeHandler } from './Connector';
import { detectRuntime, isJetBrains } from '../../config/environment';
import {
  authSubprotocols,
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
    const ws = new WebSocket(wsUrl, authSubprotocols());
    this.ws = ws;
    let opened = false;

    ws.onopen = () => {
      console.log('[WebSocketConnector] Connected');
      opened = true;
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
      this.stopLivenessWatch();
      this.isConnecting = false;
      this.ws = null;
      this.connected = false;
      this.notifyConnectionChange(false);
      if (!opened) this.noteFailedAttempt();

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
