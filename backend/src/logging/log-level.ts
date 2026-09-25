/**
 * Which log levels are recorded, and the one switch that changes it.
 *
 * Until this module existed there was no level filter anywhere: `Logger` read the
 * level only to print it into the line, then wrote every line to disk regardless.
 * A streaming turn writes a line per token, so "record everything" meant a
 * sustained 9,146 B/s to `~/.claude-code-gui/logs/` — measured on a developer
 * machine whose log directory had reached the 2 GB cap (issue #477). Moving the
 * per-token lines to DEBUG only helps if DEBUG is something we can leave out,
 * which is what this file provides.
 *
 * `log` is the default floor rather than `info` because the codebase uses
 * `console.log` for ordinary progress reporting, and dropping that would hide
 * most of what the logs are read for.
 */

export type LogLevelName = 'debug' | 'log' | 'info' | 'warn' | 'error';

/**
 * Ordering used for the "at least this level" comparison.
 *
 * `log` and `info` share a rank: the two console methods carry the same weight in
 * this codebase, and giving them separate ranks would make `CCG_LOG_LEVEL=info`
 * silently drop half of the ordinary progress lines.
 */
const SEVERITY: Record<LogLevelName, number> = {
  debug: 10,
  log: 20,
  info: 20,
  warn: 30,
  error: 40,
};

const DEFAULT_MIN_LEVEL: LogLevelName = 'log';

/** The environment variable that lowers (or raises) the floor. */
export const LOG_LEVEL_ENV = 'CCG_LOG_LEVEL';

function isLogLevelName(value: string): value is LogLevelName {
  return value in SEVERITY;
}

/**
 * The current floor.
 *
 * Read from the environment on each call rather than captured at import, so a
 * test can set it after this module is loaded, and so a long-lived backend picks
 * up a change without a restart if something ever sets it at runtime.
 * An unrecognised value falls back to the default instead of throwing — logging
 * must never be the reason a backend fails to boot.
 */
export function minLogLevel(): LogLevelName {
  const configured = process.env[LOG_LEVEL_ENV]?.trim().toLowerCase();
  if (configured && isLogLevelName(configured)) return configured;
  return DEFAULT_MIN_LEVEL;
}

/**
 * Whether a line at [level] should be recorded.
 *
 * Accepts the level in either the console-method spelling (`debug`) or the
 * spelling that appears in a written line (`DEBUG`), because callers exist on
 * both sides: the console interceptor holds the method name, while webview
 * entries arrive already carrying a level string. An unrecognised level is
 * recorded rather than dropped — losing a line we failed to classify is worse
 * than writing one extra line.
 */
export function isLevelEnabled(level: string): boolean {
  const normalized = level.trim().toLowerCase();
  if (!isLogLevelName(normalized)) return true;
  return SEVERITY[normalized] >= SEVERITY[minLogLevel()];
}

/**
 * Whether DEBUG lines are being recorded at all.
 *
 * Call sites that build an expensive message — a whole streamed event serialised
 * into a string — should ask this first and skip the work entirely, rather than
 * building the string and having it dropped by the filter afterwards.
 */
export function isDebugEnabled(): boolean {
  return isLevelEnabled('debug');
}

/**
 * Emit a DEBUG line, doing nothing at all when DEBUG is off.
 *
 * Deliberately routed through `console.error` (stderr) rather than
 * `console.debug`: in JetBrains mode the Kotlin side reads the backend's stderr,
 * and the backend's stdout carries the PORT handshake. A per-token line on stdout
 * would be forwarded into the IDE log as `[Node.js stdout] …`, which is the very
 * duplication issue #477 asked us to remove.
 *
 * When DEBUG is off nothing is called, so the line reaches neither stderr, nor the
 * log file, nor the IDE log.
 */
export function logDebug(source: string, message: string): void {
  if (!isDebugEnabled()) return;
  console.error(source, message);
}
