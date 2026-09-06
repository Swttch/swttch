import { Claude } from '../claude';
import { AccountSwitchPreflightOutcome, type AccountSwitchPreflightResult } from '../../shared';

export const ACCOUNT_SWITCH_PREFLIGHT_TIMEOUT_MS = 60_000;
export const ACCOUNT_SWITCH_PREFLIGHT_RETRY_MS = 1_000;

const PREFLIGHT_ARGS: readonly string[] = [
  '-p',
  'Reply OK',
  '--effort',
  'low',
  '--exclude-dynamic-system-prompt-sections',
  '--no-session-persistence',
  '--output-format',
  'json',
  '--strict-mcp-config',
];

interface ProbeResult {
  subtype?: string;
  is_error?: boolean;
  api_error_status?: number | null;
  error?: string;
  result?: string;
}

interface ExecFailure extends Error {
  stdout?: string;
  stderr?: string;
  killed?: boolean;
  code?: string | number | null;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseLastResult(raw: string): ProbeResult | null {
  const lines = raw.split('\n').map((line) => line.trim()).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      const parsed = JSON.parse(lines[index]) as ProbeResult;
      if (parsed.subtype || typeof parsed.is_error === 'boolean' || parsed.api_error_status) return parsed;
    } catch {
      // Hooks and launcher noise may surround the final JSON result.
    }
  }
  return null;
}

function isRateLimit(result: ProbeResult | null, raw: string): boolean {
  return result?.api_error_status === 429
    || result?.error === 'rate_limit'
    || /(?:rate[_ -]?limit|session limit|usage limit|hit your .*limit)/i.test(
      `${result?.error ?? ''}\n${result?.result ?? ''}\n${raw}`,
    );
}

function failureReason(result: ProbeResult | null, raw: string): string {
  const structured = result?.error ?? result?.result;
  if (structured?.trim()) return structured.trim();
  const lastLine = raw.split('\n').map((line) => line.trim()).filter(Boolean).pop();
  return lastLine ?? 'Account switch preflight failed';
}

/**
 * Confirm that the newly selected live credentials can complete a real model call.
 * Calls are isolated from the user's session and never persisted. Only a usage-limit
 * response is retryable; authentication, network, CLI, and all other errors stop early.
 */
export async function verifyAccountSwitch(workingDir?: string): Promise<AccountSwitchPreflightResult> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < ACCOUNT_SWITCH_PREFLIGHT_TIMEOUT_MS) {
    const attemptStartedAt = Date.now();
    const remainingMs = ACCOUNT_SWITCH_PREFLIGHT_TIMEOUT_MS - (Date.now() - startedAt);
    let raw = '';
    let failure: ExecFailure | null = null;
    try {
      const { stdout, stderr } = await Claude.execAuthed(
        [...PREFLIGHT_ARGS],
        workingDir,
        {
          timeout: Math.max(1, remainingMs),
          env: { CLAUDE_CODE_MAX_RETRIES: '0' },
        },
      );
      raw = `${stdout}\n${stderr}`;
    } catch (error) {
      failure = error instanceof Error ? error as ExecFailure : null;
      raw = `${failure?.stdout ?? ''}\n${failure?.stderr ?? ''}\n${failure?.message ?? String(error)}`;
    }

    const result = parseLastResult(raw);
    if (result?.subtype === 'success' && result.is_error === false) {
      return { outcome: AccountSwitchPreflightOutcome.SUCCESS };
    }

    const elapsedMs = Date.now() - startedAt;
    const capturedOutput = `${failure?.stdout ?? ''}${failure?.stderr ?? ''}`.trim();
    const probeReachedDeadline = failure !== null
      && elapsedMs >= ACCOUNT_SWITCH_PREFLIGHT_TIMEOUT_MS
      && (failure.killed === true || failure.code === 'ETIMEDOUT' || capturedOutput.length === 0);
    if (probeReachedDeadline) {
      return { outcome: AccountSwitchPreflightOutcome.TIMEOUT };
    }

    if (!isRateLimit(result, raw)) {
      return {
        outcome: AccountSwitchPreflightOutcome.ERROR,
        error: failureReason(result, raw),
      };
    }

    const afterAttemptRemainingMs = ACCOUNT_SWITCH_PREFLIGHT_TIMEOUT_MS - (Date.now() - startedAt);
    if (afterAttemptRemainingMs <= 0) break;
    const untilNextAttemptMs = ACCOUNT_SWITCH_PREFLIGHT_RETRY_MS - (Date.now() - attemptStartedAt);
    if (untilNextAttemptMs > 0) {
      await delay(Math.min(untilNextAttemptMs, afterAttemptRemainingMs));
    }
  }

  return { outcome: AccountSwitchPreflightOutcome.TIMEOUT };
}
