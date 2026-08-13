import { Command, ShellKind } from '../command';
import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { Claude } from '../claude';
import { MessageType } from '../../shared';
import { readRegistry, upsertAccount } from '../features/account-store';

interface UsageBucket {
  utilization: number;
  resets_at: string;
}

interface ExtraUsage {
  is_enabled: boolean;
  monthly_limit: number | null;
  used_credits: number | null;
  utilization: number | null;
}

export interface CcbUsageResponse {
  five_hour: UsageBucket | null;
  seven_day: UsageBucket | null;
  seven_day_oauth_apps: UsageBucket | null;
  seven_day_sonnet: UsageBucket | null;
  seven_day_opus: UsageBucket | null;
  seven_day_cowork: UsageBucket | null;
  iguana_necktie: UsageBucket | null;
  extra_usage: ExtraUsage | null;
}

type UsageErrorKind = 'ccb_missing' | 'npm_missing' | 'auth' | 'network' | 'unknown';

interface UsageErrorInfo {
  kind: UsageErrorKind;
  message: string;
}

interface ExecFileError extends Error {
  // child_process surfaces the process exit code as a number (e.g. 127) and spawn
  // failures as a string errno (e.g. 'ENOENT').
  code?: number | string;
}

export function classifyError(raw: string, code?: number | string): UsageErrorInfo {
  if (/npm[^a-z].*(?:command not found|not recognized)|(?:command not found|not recognized).*npm/i.test(raw)) {
    return { kind: 'npm_missing', message: 'Node.js / npm not found in PATH' };
  }

  // exit code 127 = the shell could not find the command we asked it to run (`ccb`).
  // This is the standard, locale-independent signal for a missing command: the shell's
  // "command not found" text is localized (e.g. Russian "команда не найдена") and cannot
  // be matched by an English regex, but the exit code is always 127. We additionally
  // require the `ccb` token so an unrelated failure inside the command is not misattributed.
  // The English text patterns remain as a fallback for paths where the exit code is
  // unavailable (e.g. npm's "could not determine executable to run"). (issue #114)
  //
  // Note: ENOENT is intentionally NOT treated as ccb_missing. execFile spawns the shell,
  // not ccb directly, so a missing ccb always surfaces as exit 127 — an ENOENT here means
  // the shell binary itself is absent, a different failure.
  const ccbMissingByCode = code === 127 && /\bccb\b/.test(raw);
  const ccbMissingByText = /could not determine executable to run/i.test(raw)
    || /command not found.*ccb|ccb.*not found|ccb.*not recognized/i.test(raw);
  if (ccbMissingByCode || ccbMissingByText) {
    return { kind: 'ccb_missing', message: 'The ccb CLI is not installed' };
  }

  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.error?.message) {
        return { kind: 'auth', message: parsed.error.message };
      }
    } catch { /* not JSON, fall through */ }
  }

  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|getaddrinfo/i.test(raw)) {
    return { kind: 'network', message: 'Network error reaching Anthropic API' };
  }

  const cleaned = raw
    .split('\n')
    .filter((line) => !/^npm (warn|WARN)\b/.test(line))
    .join('\n')
    .trim();
  return { kind: 'unknown', message: cleaned || raw };
}

const CACHE_TTL_MS = 90_000;
let cachedUsage: CcbUsageResponse | null = null;
let cachedAt = 0;
let inflightPromise: Promise<CcbUsageResponse> | null = null;
let lastErrorInfo: UsageErrorInfo | null = null;

export function resetUsageCache(): void {
  cachedUsage = null;
  cachedAt = 0;
  lastErrorInfo = null;
}

async function persistUsageToRegistry(usage: CcbUsageResponse): Promise<void> {
  try {
    const registry = await readRegistry();
    if (!registry.current) return;
    const account = registry.accounts[registry.current];
    if (!account) return;
    await upsertAccount({
      ...account,
      usageCached: {
        five_hour: usage.five_hour ?? null,
        seven_day: usage.seven_day ?? null,
        seven_day_sonnet: usage.seven_day_sonnet ?? null,
        seven_day_opus: usage.seven_day_opus ?? null,
      },
      usageCachedAt: Date.now(),
    });
  } catch {
    /* non-fatal: registry persist failure should never block the usage response */
  }
}

export async function runCcbUsage(): Promise<CcbUsageResponse> {
  // The Command core resolves the platform shell (win32 cmd.exe argv; unix login
  // shell so ccb sees the rc-file PATH) and layers on the augmented PATH, so ccb
  // is discoverable even when the backend's inherited PATH lacks the npm global bin.
  const { stdout } = await new Command('ccb', ['oauth', 'usage', '--json'], {
    timeout: 15000,
    shell: ShellKind.LoginInteractive,
  }).exec();
  // Interactive login shells (`-l -i`) source startup files like .bashrc, which on
  // Linux often emit control sequences such as printf "\e[?2004l" (disable bracketed
  // paste) to stdout before our output. trim() cannot strip the ESC char, so extract
  // the JSON object itself rather than parsing the raw stdout. (issue #62)
  const match = stdout.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Empty response from ccb');
  return JSON.parse(match[0]);
}

export async function getUsageHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  const force = (message.payload as { force?: boolean })?.force === true;
  const workingDir = (message.payload as { workingDir?: string })?.workingDir;

  if (!force && Date.now() - cachedAt < CACHE_TTL_MS && (cachedUsage !== null || lastErrorInfo !== null)) {
    if (cachedUsage !== null) {
      connections.sendTo(connectionId, MessageType.ACK, {
        requestId: message.requestId,
        status: 'ok',
        usage: cachedUsage,
      });
    } else {
      connections.sendTo(connectionId, MessageType.ACK, {
        requestId: message.requestId,
        status: 'error',
        usage: null,
        error: lastErrorInfo?.message ?? null,
        error_kind: lastErrorInfo?.kind ?? null,
      });
    }
    return;
  }

  if (force) {
    inflightPromise = null;
  }

  try {
    if (!force && inflightPromise !== null) {
      try {
        await inflightPromise;
      } catch {
        // absorb inflight rejection; respond based on cachedUsage
      }
      if (cachedUsage !== null) {
        connections.sendTo(connectionId, MessageType.ACK, {
          requestId: message.requestId,
          status: 'ok',
          usage: cachedUsage,
        });
      } else {
        connections.sendTo(connectionId, MessageType.ACK, {
          requestId: message.requestId,
          status: 'error',
          usage: null,
          error: lastErrorInfo?.message ?? null,
          error_kind: lastErrorInfo?.kind ?? null,
        });
      }
      return;
    }

    const runPromise = (async () => {
      // Resolve this context's CLAUDE_CONFIG_DIR onto process.env before invoking ccb,
      // so the usage child reads credentials from the same profile as chat. Only when a
      // workingDir is supplied — otherwise keep whatever context is already active so we
      // don't clobber it back to global. (#123)
      if (workingDir) await Claude.applyConfigDir(workingDir);
      const usage = await runCcbUsage();
      cachedUsage = usage;
      cachedAt = Date.now();
      lastErrorInfo = null;
      // Persist to the account registry so GET_ALL_USAGE can show stale-but-correct data
      // for this account when it becomes inactive (avoids direct HTTP to Anthropic).
      void persistUsageToRegistry(usage);
      return usage;
    })();

    if (!force) {
      inflightPromise = runPromise;
    }

    const usage = await runPromise;

    connections.sendTo(connectionId, MessageType.ACK, {
      requestId: message.requestId,
      status: 'ok',
      usage,
    });
  } catch (err) {
    const code = err instanceof Error ? (err as ExecFileError).code : undefined;
    const info = classifyError(err instanceof Error ? err.message : String(err), code);
    lastErrorInfo = info;
    cachedAt = Date.now();
    connections.sendTo(connectionId, MessageType.ACK, {
      requestId: message.requestId,
      status: 'error',
      usage: cachedUsage,
      error: info.message,
      error_kind: info.kind,
    });
  } finally {
    if (!force) {
      inflightPromise = null;
    }
  }
}
