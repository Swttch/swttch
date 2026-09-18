import { Command, ShellKind } from '../command';
import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { Claude } from '../claude';
import { MessageType } from '../../shared';
import { readProxySummary } from '../features/proxy-summary';
import { resolveEnv } from '../features/settings-env';
import { hasSettingsEnvCapability } from '../extend-kit';
import { readRegistry, upsertAccount } from '../features/account-store';
import {
  LIVE_ACCOUNT_ID, armCooldown, clearCooldown, readCooldownUntil, readUsageSnapshot,
  writeUsageSnapshot, resetUsageStore,
} from '../features/usage-cache';

interface UsageBucket {
  utilization: number;
  resets_at: string | null;
  limit_dollars?: number | null;
  used_dollars?: number | null;
  remaining_dollars?: number | null;
  locked_reason?: string | null;
}

/**
 * A limit the API names rather than giving a field of its own.
 *
 * Newer per-model windows (Fable, and whatever follows it) arrive only inside `limits`,
 * so a reader that walks the named fields never sees them. The array is not a duplicate
 * of the flat fields; it is where the entries the flat fields have no name for live.
 */
export interface UsageLimitEntry {
  kind: string;
  percent: number;
  resets_at?: string | null;
  scope?: { model?: { display_name?: string; id?: string; [key: string]: unknown }; [key: string]: unknown };
  [key: string]: unknown;
}

interface ExtraUsage {
  is_enabled: boolean;
  monthly_limit: number | null;
  used_credits: number | null;
  utilization: number | null;
}

/**
 * The usage payload as ccb prints it, carried through without editing.
 *
 * The index signature is deliberate: Anthropic ships new windows under codenames
 * without warning, and a closed type both drops them on the floor and reads as a
 * promise that these are all the fields there are.
 */
export interface CcbUsageResponse {
  five_hour: UsageBucket | null;
  seven_day: UsageBucket | null;
  seven_day_oauth_apps: UsageBucket | null;
  seven_day_sonnet: UsageBucket | null;
  seven_day_opus: UsageBucket | null;
  seven_day_cowork: UsageBucket | null;
  iguana_necktie: UsageBucket | null;
  extra_usage: ExtraUsage | null;
  limits?: UsageLimitEntry[] | null;
  [key: string]: unknown;
}

type UsageErrorKind = 'ccb_missing' | 'npm_missing' | 'auth' | 'network' | 'proxy' | 'rate_limited' | 'unknown';

/** How long the ccb child may take before this backend gives up on it. */
const SPAWN_TIMEOUT_MS = 15_000;

/**
 * The budget handed to ccb itself, deliberately short of {@link SPAWN_TIMEOUT_MS}.
 *
 * The gap is the room ccb needs to print its explanation and exit after its own
 * deadline fires. Without it the two deadlines race, and the one that wins is the
 * one that kills the process before it can say anything.
 */
const CCB_REQUEST_BUDGET_MS = 12_000;

interface UsageErrorInfo {
  kind: UsageErrorKind;
  message: string;
  /** Seconds to wait, when ccb reported one. Drives the cool-down and the UI countdown. */
  retryAfterSec?: number;
}

interface ExecFileError extends Error {
  // child_process surfaces the process exit code as a number (e.g. 127) and spawn
  // failures as a string errno (e.g. 'ENOENT').
  code?: number | string;
}

/**
 * The failure shape `ccb` prints, and the contract this backend classifies by.
 *
 * `code` is the field to read. It has always been there, and reading the message
 * instead is what produced the defect below.
 */
interface CcbFailure {
  code?: string;
  message?: string;
  hint?: string;
  /** Structured facts ccb attaches so this side never has to read them out of prose. */
  details?: { retryAfterSec?: number; [key: string]: unknown };
}

/** ccb codes that mean the saved login is the problem. */
const AUTH_CODES = new Set(['token_expired', 'unsupported_auth', 'credentials_not_found']);

/** ccb codes that mean the request never got a real answer. */
const NETWORK_CODES = new Set(['network_error', 'timeout']);

/**
 * ccb codes that mean a proxy refused to carry the request.
 *
 * Not auth, even though a refusing proxy answers 403 or 407: nothing about the
 * account is wrong when a proxy declines to open the tunnel. That reasoning used to
 * file them under `network`, which was right about the account and wrong about the
 * user — "network error" sends someone to check their internet, which is working
 * fine, while the thing that refused them is named in their own settings. They get
 * their own kind so the panel can say which proxy it was.
 */
const PROXY_CODES = new Set(['proxy_rejected', 'invalid_proxy']);

/**
 * Noise a login-interactive shell writes before the command it was asked to run.
 *
 * `zsh -l -i` sources the user's startup files, and a non-tty `-i` makes zsh
 * complain about line-editor options it cannot set. The shell is not optional —
 * a GUI-launched backend inherits a PATH without the npm global bin — so the
 * noise is filtered rather than avoided. It reached users verbatim as
 * "(eval):1: can't change option: zle" with no other explanation.
 */
const SHELL_NOISE = /^(?:\(eval\):\d+:|.*: can't change option:|npm (?:warn|WARN)\b|Command failed: )/;

function cleanOutput(raw: string): string {
  return raw
    .split('\n')
    .filter((line) => !SHELL_NOISE.test(line.trim()))
    .join('\n')
    .trim();
}

/**
 * The structured failure ccb printed, if it got far enough to print one.
 *
 * Scans for balanced objects rather than taking everything between the first `{`
 * and the last `}`. The text this reads is not a JSON document: it is a shell
 * invocation, then ccb's output, and that output can appear more than once
 * because execFile folds stderr into the error message while the caller may also
 * hold the same stderr separately. A greedy match spans both copies, fails to
 * parse, and silently drops the classification — which is what happened, and
 * what the doubled fixture in the tests now pins down.
 */
function readCcbFailure(raw: string): CcbFailure | undefined {
  for (let start = raw.indexOf('{'); start !== -1; start = raw.indexOf('{', start + 1)) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < raw.length; i++) {
      const ch = raw[i];
      if (escaped) { escaped = false; continue; }
      if (ch === '\\') { escaped = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth !== 0) continue;
        try {
          const parsed = JSON.parse(raw.slice(start, i + 1)) as { error?: CcbFailure };
          if (parsed.error?.message) return parsed.error;
        } catch { /* not the object we are after; keep scanning */ }
        break;
      }
    }
  }
  return undefined;
}

export function classifyError(err: unknown, env: NodeJS.ProcessEnv = process.env): UsageErrorInfo {
  const raw = err instanceof Error ? err.message : String(err);
  const detail = (err ?? {}) as { code?: number | string; killed?: boolean; stderr?: string };
  const code = typeof detail.code === 'number' || typeof detail.code === 'string' ? detail.code : undefined;
  // execFile folds stderr into the message, but reading the field directly is
  // what makes this work when a caller hands over the error rather than a string.
  const output = [raw, detail.stderr].filter(Boolean).join('\n');

  if (/npm[^a-z].*(?:command not found|not recognized)|(?:command not found|not recognized).*npm/i.test(output)) {
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
  const ccbMissingByCode = code === 127 && /\bccb\b/.test(output);
  const ccbMissingByText = /could not determine executable to run/i.test(output)
    || /command not found.*ccb|ccb.*not found|ccb.*not recognized/i.test(output);
  if (ccbMissingByCode || ccbMissingByText) {
    return { kind: 'ccb_missing', message: 'The ccb CLI is not installed' };
  }

  // An installed-but-too-old kit rides the same code, because one button fixes both: the
  // panel's install runs @latest, which updates an existing install. The message still says
  // which of the two it was, so "update" is never shown as "install".
  if (/^Update ccb:/.test(cleanOutput(raw))) {
    return { kind: 'ccb_missing', message: cleanOutput(raw) };
  }

  /**
   * Classify by the code ccb reported, not by the fact that it reported at all.
   *
   * Every structured failure used to be labelled `auth`, so a proxy that refused
   * the connection told the user their login had a problem. ccb had said
   * `"code": "network_error"` in the very payload being read, next to an
   * ECONNREFUSED, and the label ignored it. The hint is appended because the
   * usage panel renders this message verbatim: it is the only place the user is
   * told which proxy was involved or what to do about it.
   */
  const failure = readCcbFailure(output);
  if (failure) {
    const message = failure.hint ? `${failure.message} ${failure.hint}` : failure.message ?? raw;
    if (failure.code && AUTH_CODES.has(failure.code)) return { kind: 'auth', message };
    if (failure.code && PROXY_CODES.has(failure.code)) return { kind: 'proxy', message };
    if (failure.code && NETWORK_CODES.has(failure.code)) return { kind: 'network', message };
    // Rate limiting is its own kind because it is the one failure with an answer:
    // stop asking. The caller arms a cool-down from retryAfterSec rather than
    // parsing the number back out of the sentence.
    if (failure.code === 'rate_limited') {
      const retryAfterSec = typeof failure.details?.retryAfterSec === 'number'
        ? failure.details.retryAfterSec
        : undefined;
      return { kind: 'rate_limited', message, ...(retryAfterSec !== undefined && { retryAfterSec }) };
    }
    // Everything else ccb can report (forbidden, rate_limited, server_error,
    // api_error) is the destination answering. None of them is an auth problem,
    // and none has a UI treatment of its own, so the message carries the detail.
    return { kind: 'unknown', message };
  }

  /**
   * Killed by our own spawn budget, with nothing usable printed.
   *
   * ccb is told the budget and normally answers first with a `timeout` of its
   * own, which lands in the branch above and names the phase it stalled in. This
   * is the backstop for when the child never got that far, and it exists because
   * what surfaced instead was the shell's complaint about its line editor.
   */
  if (detail.killed) {
    // Naming the proxy when we can see one turns "check whether you have a proxy"
    // into "this proxy did not answer".
    //
    // The absence of one proves nothing, though, and the fallback keeps its
    // conditional wording for that reason: this reads the environment we can see,
    // while ccb runs through a login shell (`zsh -l -i`) that sources the user's
    // startup files. A proxy exported in `.zshrc` reaches ccb and never reaches us,
    // so "no proxy here" must not be reported as "no proxy at all".
    const proxy = readProxySummary(env);
    return {
      kind: proxy ? 'proxy' : 'network',
      message: proxy
        ? `The usage lookup did not finish within ${SPAWN_TIMEOUT_MS / 1000}s. `
          + `It goes out through ${proxy.url} (${proxy.variable}), which did not answer in time.`
        : `The usage lookup did not finish within ${SPAWN_TIMEOUT_MS / 1000}s. `
          + 'If this machine reaches Anthropic through a proxy, check that the proxy is responding.',
    };
  }

  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|getaddrinfo/i.test(output)) {
    return { kind: 'network', message: 'Network error reaching Anthropic API' };
  }

  const cleaned = cleanOutput(output);
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
  // The stored snapshot and cool-down are part of the same cache from a caller's point
  // of view: a reset that left them behind would still skip the next request.
  resetUsageStore(LIVE_ACCOUNT_ID);
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

/**
 * The id the snapshot and cool-down for the live CLI login are filed under.
 *
 * The registry's `current` when there is one, so switching accounts switches which
 * cool-down applies; otherwise the literal "live". Without this an account that got
 * rate limited would mute the panel for whichever account the user switched to next.
 */
/** The sentence shown while a cool-down is running, with the wait rounded to minutes. */
function rateLimitedMessage(retryAtMs: number, now = Date.now()): string {
  const minutes = Math.max(1, Math.ceil((retryAtMs - now) / 60_000));
  return `Rate limited by the Anthropic API. Usage will refresh in about ${minutes}m.`;
}

async function currentAccountId(): Promise<string> {
  try {
    const registry = await readRegistry();
    return registry.current ?? LIVE_ACCOUNT_ID;
  } catch {
    return LIVE_ACCOUNT_ID;
  }
}

/**
 * A window as the CLI reports it mid-conversation: a fraction, and an epoch second.
 *
 * Deliberately not the shape ccb returns. The two sources describe the same windows in
 * different units, and this is where the CLI's units are converted into the one the rest
 * of the code already speaks, rather than teaching every reader about both.
 */
interface StreamWindow {
  utilization?: number;
  resetsAt?: number;
}

function streamWindowToBucket(window: StreamWindow | undefined): UsageBucket | null {
  if (!window || typeof window.utilization !== 'number') return null;
  return {
    utilization: Math.round(window.utilization * 100),
    resets_at: typeof window.resetsAt === 'number' ? new Date(window.resetsAt * 1000).toISOString() : null,
  };
}

/**
 * Absorb the usage the CLI volunteers during a conversation.
 *
 * The CLI emits `rate_limit_event` on its own while a turn runs, carrying the same five
 * hour and seven day windows the usage endpoint serves. Taking it means the panel stays
 * current through a chat without spending a request, and a request not made is a request
 * that cannot be rate limited — this is the cheapest of the protections in this file.
 *
 * Only the windows the event actually carries are written. An event is an update, not a
 * full statement of everything known, so a window it omits keeps whatever the last read
 * established rather than being blanked.
 */
export async function ingestRateLimitWindows(unifiedWindows: unknown): Promise<void> {
  if (!unifiedWindows || typeof unifiedWindows !== 'object') return;
  const windows = unifiedWindows as Record<string, StreamWindow | undefined>;
  const fiveHour = streamWindowToBucket(windows.five_hour);
  const sevenDay = streamWindowToBucket(windows.seven_day);
  if (!fiveHour && !sevenDay) return;

  const accountId = await currentAccountId();
  const previous = readUsageSnapshot(accountId)?.usage ?? cachedUsage;
  const merged: CcbUsageResponse = {
    ...(previous ?? EMPTY_USAGE),
    ...(fiveHour && { five_hour: fiveHour }),
    ...(sevenDay && { seven_day: sevenDay }),
  };

  cachedUsage = merged;
  cachedAt = Date.now();
  lastErrorInfo = null;
  writeUsageSnapshot(accountId, merged);
  // The CLI answered, so whatever made the last request fail is over.
  clearCooldown(accountId);
  void persistUsageToRegistry(merged);
}

/** The shape a merge starts from when nothing has been read yet. */
const EMPTY_USAGE: CcbUsageResponse = {
  five_hour: null,
  seven_day: null,
  seven_day_oauth_apps: null,
  seven_day_sonnet: null,
  seven_day_opus: null,
  seven_day_cowork: null,
  iguana_necktie: null,
  extra_usage: null,
};

export async function runCcbUsage(workingDir?: string): Promise<CcbUsageResponse> {
  // Settle the Claude data directory first, so the child reads credentials from the same
  // profile chat does. `Command` is the generic runner and knows nothing about Claude, so
  // unlike `Claude.exec` it cannot do this for us.
  await Claude.applyConfigDir(workingDir);

  // A kit too old to read Claude's settings files cannot see a proxy configured only there.
  // This backend used to copy that value into the child's environment and no longer does, so
  // on such a kit the panel would simply time out — the exact symptom of the report that got
  // the copying added in the first place (#181), now with no message pointing anywhere.
  // Saying "update ccb" is the one answer that helps, and the panel's install button
  // installs @latest, which is also the update.
  if (!(await hasSettingsEnvCapability(workingDir))) {
    throw new Error('Update ccb: this version cannot read Claude Code settings files');
  }

  // The Command core resolves the platform shell (win32 cmd.exe argv; unix login
  // shell so ccb sees the rc-file PATH) and layers on the augmented PATH, so ccb
  // is discoverable even when the backend's inherited PATH lacks the npm global bin.
  //
  // `cwd` is how ccb learns which project it is answering for: it reads Claude's settings
  // files itself now, and the project pair of those lives under the working directory.
  // Without it a project's proxy — or its CLAUDE_CODE_OAUTH_TOKEN — is simply not seen.
  const { stdout } = await new Command('ccb', ['oauth', 'usage', '--json'], {
    timeout: SPAWN_TIMEOUT_MS,
    cwd: workingDir,
    // Tell ccb the budget instead of only enforcing it from out here. Killing the
    // child at the mark leaves whatever its shell had printed by then standing in
    // for an explanation; given the budget, ccb finishes inside it and reports
    // which phase stalled and whether a proxy was involved.
    env: { CCB_REQUEST_TIMEOUT_MS: String(CCB_REQUEST_BUDGET_MS) },
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

  // Read once per request and attached to every answer, so the panel can name the hop
  // a request takes instead of asking the user whether they are behind a proxy.
  //
  // Resolved rather than read straight from process.env: the proxy the user configured may
  // live only in Claude's settings.json, which is not an environment variable — naming no
  // proxy there would send someone to check an internet connection that works fine.
  const env = await resolveEnv(workingDir);
  const proxy = readProxySummary(env);

  if (!force && Date.now() - cachedAt < CACHE_TTL_MS && (cachedUsage !== null || lastErrorInfo !== null)) {
    if (cachedUsage !== null) {
      connections.sendTo(connectionId, MessageType.ACK, {
        requestId: message.requestId,
        proxy,
        status: 'ok',
        usage: cachedUsage,
      });
    } else {
      connections.sendTo(connectionId, MessageType.ACK, {
        requestId: message.requestId,
        proxy,
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
          proxy,
          status: 'ok',
          usage: cachedUsage,
        });
      } else {
        connections.sendTo(connectionId, MessageType.ACK, {
          requestId: message.requestId,
          proxy,
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
      // so the usage child reads credentials from the same profile as chat. (#123)
      //
      // Unconditional, where it used to run only when a workingDir was supplied. Skipping
      // it does not leave the answer "unset" — process.env is one slot for the whole
      // backend, so skipping leaves whatever project last wrote it, and the usage panel of
      // a project with no override would quietly read another project's credentials.
      // Calling with no workingDir resolves to the global value, which is the right answer
      // for a context that has no project.
      await Claude.applyConfigDir(workingDir);

      const accountId = await currentAccountId();

      // Being rate limited is the one failure with an answer, and the answer is to stop
      // asking: another request inside the window just renews the penalty. An explicit
      // user refresh punches through the snapshot below, but never through this — the
      // hammering is exactly what the cool-down exists to prevent.
      const cooldownUntil = readCooldownUntil(accountId);
      if (cooldownUntil) {
        const stored = readUsageSnapshot(accountId);
        if (stored) return stored.usage;
        throw Object.assign(new Error(rateLimitedMessage(cooldownUntil)), { ccgRateLimited: true });
      }

      // A snapshot written in the last few minutes answers the same question the request
      // would, without spending it. Skipped on an explicit refresh, and skipped once a
      // window has rolled over, so a reset is never hidden behind the cache.
      if (!force) {
        const fresh = readUsageSnapshot(accountId, { freshOnly: true });
        if (fresh) return fresh.usage;
      }

      const usage = await runCcbUsage(workingDir);
      cachedUsage = usage;
      cachedAt = Date.now();
      lastErrorInfo = null;
      writeUsageSnapshot(accountId, usage);
      clearCooldown(accountId);
      // Persist to the account registry so GET_ALL_USAGE can show stale-but-correct data
      // for this account when it becomes inactive (avoids direct HTTP to Anthropic).
      void persistUsageToRegistry(usage);
      return usage;
    })();

    if (!force) {
      inflightPromise = runPromise;
    }

    const usage = await runPromise;

    // `stale` and `cached_at` ride on every successful answer, live or stored, so the
    // panel can render "updated N minutes ago" without guessing which it received.
    const served = readUsageSnapshot(await currentAccountId());
    connections.sendTo(connectionId, MessageType.ACK, {
      requestId: message.requestId,
      proxy,
      status: 'ok',
      usage,
      stale: served?.stale ?? false,
      cached_at: new Date(served?.cachedAt ?? Date.now()).toISOString(),
    });
  } catch (err) {
    const info = classifyError(err, env);
    const accountId = await currentAccountId();

    // A fresh 429 arms the cool-down. The seconds come from ccb's structured details
    // rather than from the sentence, so a reworded message cannot silently turn the
    // wait into the default.
    if (info.kind === 'rate_limited') {
      armCooldown(accountId, info.retryAfterSec);
    }

    // Bars that were correct a few minutes ago beat an empty panel, so a stored read is
    // served through any failure. It is marked stale so the UI can say how old it is
    // instead of passing it off as current.
    const stored = readUsageSnapshot(accountId);
    if (stored) {
      lastErrorInfo = info;
      cachedAt = Date.now();
      connections.sendTo(connectionId, MessageType.ACK, {
        requestId: message.requestId,
        proxy,
        status: 'ok',
        usage: stored.usage,
        stale: stored.stale,
        cached_at: new Date(stored.cachedAt).toISOString(),
        ...(info.kind === 'rate_limited' && { error: info.message, error_kind: info.kind }),
      });
      return;
    }

    lastErrorInfo = info;
    cachedAt = Date.now();
    connections.sendTo(connectionId, MessageType.ACK, {
      requestId: message.requestId,
      proxy,
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
