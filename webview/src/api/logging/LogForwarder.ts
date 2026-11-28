import { MessageType } from '@/shared';
import { isJetBrains } from '../../config/environment';
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

/**
 * Ordering for the "at least this level" comparison, mirroring
 * `backend/src/logging/log-level.ts`. `log` and `info` share a rank there for the
 * same reason they do here: the two carry the same weight in this codebase.
 */
const SEVERITY: Record<string, number> = {
  debug: 10,
  log: 20,
  info: 20,
  warn: 30,
  error: 40,
};

/**
 * Levels below this are kept in the local history but never shipped to the
 * backend, so they never reach the log file.
 *
 * The webview used to forward every console call regardless of level. With one
 * line per streamed token on a busy turn, that was half of the 9,146 B/s written
 * to `~/.claude-code-gui/logs/` in issue #477. DEBUG is where the per-token lines
 * now live, and `ccgLogs.setLevel('debug')` turns them back on for a session when
 * something actually needs them.
 *
 * Not persisted deliberately: a JetBrains webview gets a different origin on every
 * launch, so anything stored in `localStorage` would start empty anyway.
 */
const DEFAULT_MIN_LEVEL = 'log';

const MAX_QUEUE_SIZE = 500;
/**
 * Investigation-only ring buffer (see `window.ccgLogs`). Not sent anywhere.
 *
 * Bounded by total size rather than by a line count. A line count is the wrong
 * unit for this: a busy turn writes a line per streamed token, so the 5000-line
 * cap this replaces held only ~84 seconds of one session — issue #232 came with
 * a log the reporter copied exactly as asked, and the entries that caused the
 * bug had already been pushed out of it before they could be read.
 *
 * 32 MB holds hours of an ordinary session at the ~200 bytes/line measured from
 * that report, while still capping what a long-lived tab can retain.
 */
const MAX_HISTORY_BYTES = 32 * 1024 * 1024;
/**
 * What is left once the budget has been passed, so that room is made for many lines at once. Making it for one line
 * at a time moves every line left behind, once for every line taken: with hundreds of thousands of short lines, one
 * long line held the page for a minute (#714).
 */
const HISTORY_BYTES_AFTER_EVICTION = MAX_HISTORY_BYTES * 0.9;
const FLUSH_INTERVAL_MS = 500;
const RECONNECT_DELAY_MS = 2000;

/**
 * How long one argument of a console call may be once written out. A click on a chat entry, which is also how a drag
 * over its text ends, logs every loaded message: one line of several megabytes (#714).
 *
 * Up to MAX_ARGUMENT_CHARS it is written in full; past that only its beginning is kept; past OMITTED_ARGUMENT_CHARS
 * it is not written at all, and a warning says where the whole of it can be had. The browser console is handed the
 * value itself either way.
 */
const MAX_ARGUMENT_CHARS = 32 * 1024;
export const OMITTED_ARGUMENT_CHARS = 1024 * 1024;
const TRUNCATED_MARK = '… [truncated]';
export const OMITTED_MARK = `[omitted: over ${OMITTED_ARGUMENT_CHARS} characters]`;
export const OMITTED_NOTICE =
  `[LogForwarder] A value over ${OMITTED_ARGUMENT_CHARS} characters was left out of the log. ` +
  'To get the whole of it, use "Download plugin front log": in the command panel, in the right-click menu of the ' +
  'message area, or with Cmd/Ctrl+Option/Alt+Shift+G.';

/**
 * One console argument as text.
 *
 * A value is not walked into past OMITTED_ARGUMENT_CHARS: writing all of it out to find how long it is would cost the
 * page as much as keeping all of it. Once that much has been read, what is left is handed to `JSON.stringify` as
 * `undefined`, so nothing under it is read.
 */
function describeArgument(value: unknown): string {
  if (typeof value === 'string') return fitToLine(value);

  let room = OMITTED_ARGUMENT_CHARS;
  let over = false;
  try {
    const json: string | undefined = JSON.stringify(value, (key, item: unknown) => {
      // Nothing is written for these, so they use no room.
      if (item === undefined || typeof item === 'function') return item;
      if (over) return undefined;
      room -= key.length + 2 + (typeof item === 'string' ? item.length : 0);
      // A list longer than the room left would be gone through to its end, one `null` per item.
      if (room < 0 || (Array.isArray(item) && item.length > room)) {
        over = true;
        return undefined;
      }
      return item;
    });
    if (over) return OMITTED_MARK;
    return json === undefined ? '' : fitToLine(json);
  } catch {
    return fitToLine(String(value));
  }
}

function fitToLine(text: string): string {
  if (text.length <= MAX_ARGUMENT_CHARS) return text;
  if (text.length > OMITTED_ARGUMENT_CHARS) return OMITTED_MARK;
  // A plain `slice` keeps the whole of the long string alive behind the short one, which the history would then hold
  // on to. Writing it out as JSON and reading it back makes a string of its own.
  const head = JSON.parse(JSON.stringify(text.slice(0, MAX_ARGUMENT_CHARS))) as string;
  return head + TRUNCATED_MARK;
}

export class LogForwarder {
  private ws: WebSocket | null = null;
  private buffer: LogEntry[] = [];
  /** Full session history for investigation; drained only via window.ccgLogs. */
  private history: LogEntry[] = [];
  /** Running total of `history` message lengths, to trim without re-measuring. */
  private historyBytes: number = 0;
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed: boolean = false;
  private originalConsole: Record<string, (...args: unknown[]) => void> = {};
  private sessionId: string | null = null;
  private minLevel: string = DEFAULT_MIN_LEVEL;

  /** Whether a line at this level is shipped to the backend. */
  private isForwarded(level: string): boolean {
    const rank = SEVERITY[level];
    const floor = SEVERITY[this.minLevel] ?? SEVERITY[DEFAULT_MIN_LEVEL];
    // An unrecognised level is forwarded rather than dropped — losing a line we
    // failed to classify is worse than writing one extra line.
    if (rank === undefined) return true;
    return rank >= floor;
  }

  /**
   * Raise or lower the forwarding floor for this session.
   *
   * Reachable from the browser console as `ccgLogs.setLevel('debug')`, which is
   * how a per-token trace gets turned back on while investigating something.
   */
  setLevel(level: string): string {
    const normalized = level.trim().toLowerCase();
    if (!(normalized in SEVERITY)) {
      return `unknown level: ${level} (use one of ${Object.keys(SEVERITY).join(', ')})`;
    }
    this.minLevel = normalized;
    return `forwarding levels >= ${normalized}`;
  }

  /**
   * The "Debug Mode" setting (issue #723): forward DEBUG lines while it is on, and go back to
   * the default floor when it is off.
   *
   * The floor is also what decides whether a DEBUG line reaches the JetBrains log at all (see
   * `interceptConsole`), so the setting and the IDE's own debug-log switch have to move together;
   * the backend keeps them equal.
   */
  setDebugLogging(enabled: boolean): void {
    this.minLevel = enabled ? 'debug' : DEFAULT_MIN_LEVEL;
  }

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
    this.historyBytes = 0;
  }

  /**
   * Mirror the history helpers onto `window.ccgLogs` for use straight from the
   * browser console:
   *
   *   ccgLogs.copy()            all logs → clipboard
   *   ccgLogs.copy('[Bridge]')  only lines containing the filter
   *   ccgLogs.text()            same, returned as a string
   *   ccgLogs.clear()           reset the buffer
   *   ccgLogs.setLevel('debug') also forward DEBUG lines to the log file
   */
  private exposeInvestigationApi(): void {
    (window as unknown as { ccgLogs: unknown }).ccgLogs = {
      text: (filter?: string) => this.getHistoryText(filter),
      count: () => this.getHistoryCount(),
      clear: () => {
        this.clearHistory();
        return 'cleared';
      },
      setLevel: (level: string) => this.setLevel(level),
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
        // In the JetBrains webview the native console has exactly one consumer:
        // idea.log, via the Kotlin console handler (DevTools is not practically
        // usable in JCEF). A line below the floor would cross the JCEF process
        // boundary only to be written to idea.log (issue #723: ~62,000 lines in
        // 25 minutes). It stays in the local history for `ccgLogs`. A standalone
        // browser keeps the native console, where DevTools is the reader.
        if (!(isJetBrains() && !this.isForwarded(method))) {
          original(...args);
        }

        const described = args.map(describeArgument);
        const message = described.join(' ');
        // Below the floor the line stays local: it is still in the history for
        // `ccgLogs`, but it is never sent to the backend and so never written to
        // the log file.
        if (this.isForwarded(method)) {
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
        }

        this.history.push({
          level: method as unknown as LogLevel,
          source: 'webview',
          sessionId: this.sessionId,
          message,
          timestamp: Date.now(),
        });
        this.historyBytes += message.length;
        if (this.historyBytes > MAX_HISTORY_BYTES) this.evictOldest();
        // Said after the line it is about. The notice carries no omitted mark, so it does not call for itself again.
        if (described.includes(OMITTED_MARK)) console.warn(OMITTED_NOTICE);
      };
    }
  }

  /** Drop the oldest lines, all in one move, and never the newest one. */
  private evictOldest(): void {
    let count = 0;
    while (this.historyBytes > HISTORY_BYTES_AFTER_EVICTION && count < this.history.length - 1) {
      this.historyBytes -= this.history[count].message.length;
      count++;
    }
    this.history.splice(0, count);
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
