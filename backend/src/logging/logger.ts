import { FileLogger } from './file-logger';
import { LogWebSocketServer, LogEntry } from './log-ws';
import { isLevelEnabled } from './log-level';

const CONSOLE_METHODS = ['log', 'info', 'warn', 'error', 'debug'] as const;
type ConsoleMethod = (typeof CONSOLE_METHODS)[number];

const LEVEL_MAP: Record<ConsoleMethod, string> = {
  log: 'LOG',
  info: 'INFO',
  warn: 'WARN',
  error: 'ERROR',
  debug: 'DEBUG',
};

// '[node-backend]' 같은 패턴 감지
const SOURCE_PREFIX_PATTERN = /^\[([^\]]+)\]$/;

export class Logger {
  private readonly fileLogger: FileLogger;
  private logWs: LogWebSocketServer | null = null;
  private originalConsole: Record<string, (...args: unknown[]) => void> = {};
  private isIntercepting: boolean = false;

  constructor(logDir?: string) {
    this.fileLogger = new FileLogger(logDir);
  }

  async init(): Promise<void> {
    await this.fileLogger.init();
  }

  setLogWs(logWs: LogWebSocketServer): void {
    this.logWs = logWs;
  }

  interceptConsole(): void {
    for (const method of CONSOLE_METHODS) {
      const original = console[method].bind(console);
      this.originalConsole[method] = original;

      console[method] = (...args: unknown[]) => {
        // 원본 함수 먼저 호출 — JetBrains Kotlin이 stderr를 읽으므로 반드시 유지
        original(...args);

        // 재진입 방지 — FileLogger.write() 내부에서 console.error가 호출될 수 있음
        if (this.isIntercepting) {
          return;
        }
        this.isIntercepting = true;

        try {
          const level = LEVEL_MAP[method];

          // Levels below the configured floor are neither written nor broadcast.
          // Checked before the message is assembled, because assembling it means
          // JSON.stringify-ing every non-string argument — on a streaming turn
          // that is once per token, which is the cost issue #477 measured.
          if (!isLevelEnabled(level)) {
            return;
          }

          // 첫 번째 인자가 '[xxx]' 패턴이면 source로 추출
          let source: string;
          let messageArgs: unknown[];

          if (
            args.length > 0 &&
            typeof args[0] === 'string' &&
            SOURCE_PREFIX_PATTERN.test(args[0].trim())
          ) {
            const match = SOURCE_PREFIX_PATTERN.exec(args[0].trim());
            source = match ? match[1] : 'node-backend';
            messageArgs = args.slice(1);
          } else {
            source = 'node-backend';
            messageArgs = args;
          }

          const message = messageArgs
            .map((a) => (typeof a === 'string' ? a : JSON.stringify(a)))
            .join(' ');

          this.writeLog(level, source, null, message);
        } finally {
          this.isIntercepting = false;
        }
      };
    }
  }

  handleWebViewLogs(entries: LogEntry[]): void {
    for (const entry of entries) {
      // The webview applies the same floor before sending, but an older webview
      // served from a cached bundle may not. Filtering here too means the backend
      // decides what lands on disk regardless of which webview is talking to it.
      if (!isLevelEnabled(entry.level)) {
        continue;
      }
      const line = this.formatLine(entry.level, entry.source, entry.sessionId, entry.message, entry.timestamp);
      this.fileLogger.write(line);
      if (this.logWs) {
        this.logWs.broadcast(line);
      }
    }
  }

  private writeLog(
    level: string,
    source: string,
    sessionId: string | null,
    message: string,
  ): void {
    const line = this.formatLine(level, source, sessionId, message);
    this.fileLogger.write(line);
    if (this.logWs) {
      this.logWs.broadcast(line);
    }
  }

  private formatLine(
    level: string,
    source: string,
    sessionId: string | null,
    message: string,
    timestamp?: number,
  ): string {
    const ts = timestamp ? new Date(timestamp).toISOString() : new Date().toISOString();
    const sessionPart = sessionId ? `[${sessionId}]` : '';
    return `${ts} ${level} [${source}]${sessionPart} ${message}\n`;
  }

  async close(): Promise<void> {
    await this.fileLogger.close();
  }
}

let logger: Logger;

export function initLogger(logDir?: string): Logger {
  logger = new Logger(logDir);
  return logger;
}

export function getLogger(): Logger {
  return logger;
}
