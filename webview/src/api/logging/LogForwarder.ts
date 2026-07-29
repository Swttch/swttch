import { MessageType } from '@/shared';
import { authSubprotocols, ensureAuthTokenReady, isRemoteBlocked } from '../bridge/authToken';

enum LogLevel {
  LOG = 'log',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
  DEBUG = 'debug',
}

interface LogEntry {
  level: LogLevel;
  source: string;
  sessionId: string | null;
  message: string;
  timestamp: number;
}

const CONSOLE_METHODS = ['log', 'info', 'warn', 'error', 'debug'] as const;
const MAX_QUEUE_SIZE = 500;
/** Investigation-only ring buffer (see `window.ccgLogs`). Not sent anywhere. */
const MAX_HISTORY_SIZE = 5000;
const FLUSH_INTERVAL_MS = 500;
const RECONNECT_DELAY_MS = 2000;

class LogForwarder {
  private ws: WebSocket | null = null;
  private buffer: LogEntry[] = [];
  /** Full session history for investigation; drained only via window.ccgLogs. */
  private history: LogEntry[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed: boolean = false;
  private originalConsole: Record<string, (...args: unknown[]) => void> = {};
  private sessionId: string | null = null;

  start(): void {
    this.interceptConsole();
    this.exposeInvestigationApi();
    this.connect();
    this.flushTimer = setInterval(() => this.flush(), FLUSH_INTERVAL_MS);
  }

  /**
   * The console history as one plain-text block, newest last. Used to hand over a
   * whole session's logs at once — from the command palette, or from the console
   * via `window.ccgLogs`.
   */
  getHistoryText(filter?: string): string {
    const entries = filter
      ? this.history.filter((e) => e.message.includes(filter))
      : this.history;
    return entries
      .map((e) => `${new Date(e.timestamp).toISOString()} [${e.level}] ${e.message}`)
      .join('\n');
  }

  getHistoryCount(): number {
    return this.history.length;
  }

  clearHistory(): void {
    this.history = [];
  }

  /**
   * Mirror the history helpers onto `window.ccgLogs` for use straight from the
   * browser console:
   *
   *   ccgLogs.copy()            all logs → clipboard
   *   ccgLogs.copy('[Bridge]')  only lines containing the filter
   *   ccgLogs.text()            same, returned as a string
   *   ccgLogs.clear()           reset the buffer
   */
  private exposeInvestigationApi(): void {
    (window as unknown as { ccgLogs: unknown }).ccgLogs = {
      text: (filter?: string) => this.getHistoryText(filter),
      count: () => this.getHistoryCount(),
      clear: () => {
        this.clearHistory();
        return 'cleared';
      },
      copy: async (filter?: string) => {
        const text = this.getHistoryText(filter);
        try {
          await navigator.clipboard.writeText(text);
          return `copied ${text.split('\n').length} lines`;
        } catch {
          // Clipboard needs a focused document; fall back to a manual selection.
          return text;
        }
      },
    };
  }

  dispose(): void {
    this.disposed = true;
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
  }

  setSessionId(sessionId: string | null): void {
    this.sessionId = sessionId;
  }

  private connect(): void {
    // Never open a doomed/forbidden logs socket (unpaired remote device). Logging
    // is best-effort — silently stay disconnected.
    if (this.disposed || isRemoteBlocked()) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/logs`;

    // The /logs control channel requires the same per-launch auth token, carried
    // as the `ccg-auth` subprotocol. The token may only be available after the
    // async pairing exchange, so resolve it first — and never construct a socket
    // with an empty token ('' subprotocol is invalid and throws).
    void ensureAuthTokenReady().then((token) => {
      if (this.disposed || isRemoteBlocked()) return;
      if (!token) {
        // No token yet (pairing pending/failed) — retry later, best-effort.
        this.reconnectTimer = setTimeout(() => this.connect(), RECONNECT_DELAY_MS);
        return;
      }
      const ws = new WebSocket(wsUrl, authSubprotocols());
      ws.onopen = () => {
        this.ws = ws;
        this.flush();
      };
      ws.onclose = () => {
        this.ws = null;
        if (!this.disposed && !isRemoteBlocked()) {
          this.reconnectTimer = setTimeout(() => this.connect(), RECONNECT_DELAY_MS);
        }
      };
      ws.onerror = () => {
        // onclose가 자동으로 호출됨
      };
    });
  }

  private interceptConsole(): void {
    for (const method of CONSOLE_METHODS) {
      const original = console[method].bind(console);
      this.originalConsole[method] = original;

      console[method] = (...args: unknown[]) => {
        original(...args);

        const message = args
          .map((a) => {
            if (typeof a === 'string') return a;
            try {
              return JSON.stringify(a);
            } catch {
              return String(a);
            }
          })
          .join(' ');
        this.buffer.push({
          level: method as unknown as LogLevel,
          source: 'webview',
          sessionId: this.sessionId,
          message,
          timestamp: Date.now(),
        });

        if (this.buffer.length > MAX_QUEUE_SIZE) {
          this.buffer = this.buffer.slice(-MAX_QUEUE_SIZE);
        }

        this.history.push({
          level: method as unknown as LogLevel,
          source: 'webview',
          sessionId: this.sessionId,
          message,
          timestamp: Date.now(),
        });
        if (this.history.length > MAX_HISTORY_SIZE) {
          this.history = this.history.slice(-MAX_HISTORY_SIZE);
        }
      };
    }
  }

  private flush(): void {
    if (this.buffer.length === 0) return;
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const entries = this.buffer.splice(0);
    this.ws.send(JSON.stringify({ type: MessageType.LOG_BATCH, entries }));
  }
}

let logForwarder: LogForwarder;

export function initLogForwarder(): LogForwarder {
  logForwarder = new LogForwarder();
  logForwarder.start();
  return logForwarder;
}

export function getLogForwarder(): LogForwarder {
  return logForwarder;
}
