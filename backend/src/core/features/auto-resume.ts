import type { ConnectionManager } from '../../ws/connection-manager';
import {
  MessageType,
  ScheduledMessageKind,
  AutoResumeStatusPhase,
  type ScheduledMessage,
} from '../../shared';
import { runCcbUsage, classifyError, type CcbUsageResponse } from '../handlers/getUsage';
import { registerHook, type ScheduleHook } from './scheduled-messages';

/**
 * Layer-2 "auto-resume on limit reset": PRE-SEND GATE half.
 *
 * The generic scheduled-message engine fires an AUTO_RESUME reservation at its
 * `sendAt`, but before delivering it we must confirm the usage quota has
 * actually recharged. This module registers the engine hook that performs that
 * check by polling the usage battery (ccb) and only proceeds once recharged.
 *
 * Retry policy (user-confirmed): from the moment the hook runs, re-check every
 * POLL interval for up to the TIMEOUT window. Recharge within the window →
 * proceed (send now). Still not recharged at timeout → give up. A usage-FETCH
 * ERROR (network, auth, ccb missing, ...) is NOT "not recharged" — it aborts
 * immediately with a human-readable reason. These two are deliberately kept
 * distinct: "not recharged yet" is a normal response that keeps retrying.
 */

/** Re-check interval. Exported so callers/tests can override. */
export const DEFAULT_POLL_INTERVAL_MS = 5_000;
/** Total polling window before giving up. Exported so callers/tests can override. */
export const DEFAULT_TIMEOUT_MS = 10 * 60_000;

/**
 * Recharge threshold as a FRACTION of the limit (0–1). The five-hour bucket
 * resets to ~0 utilization when the window rolls over, so anything at/below this
 * clearly indicates "recharged" vs "at limit (~1.0)".
 *
 * ⚠️ 실측 필요: the real utilization value at an actual limit is unverified. The
 * webview treats `utilization` as a 0–100 PERCENTAGE (see webview/src/types/
 * usage.ts "0-100 percentage", UsageRow clamp, TokenBatteryButton `100 -
 * utilization`), which is what runCcbUsage feeds. To stay correct even if some
 * path reports a 0–1 fraction, `utilizationFraction` normalizes both scales.
 */
export const RECHARGE_UTILIZATION_FRACTION = 0.5;

/**
 * Margin (ms) by which the bucket's `resets_at` must exceed the reservation's
 * `sendAt` to count as "the window rolled over". A margin avoids a false
 * positive when `sendAt` was set slightly before the original `resets_at`
 * (a real reset jumps `resets_at` forward by ~5h, far beyond this margin).
 */
export const RESET_ROLLOVER_MARGIN_MS = 60_000;

/** Tunable thresholds for the pure recharge decision. */
export interface RechargeOpts {
  utilizationFraction?: number;
  resetRolloverMarginMs?: number;
}

/**
 * Normalize a `utilization` reading to a 0–1 fraction. runCcbUsage reports a
 * 0–100 percentage; values ≤ 1 are treated as an already-fractional scale. This
 * makes the recharge decision robust to either representation. (A genuine "1%"
 * on the 0–100 scale collapses to 1.0 here → conservatively "not recharged",
 * which only costs one extra retry — the safe direction.)
 */
export function utilizationFraction(utilization: number): number {
  return utilization > 1 ? utilization / 100 : utilization;
}

/**
 * Pure recharge decision. Recharged when EITHER the five-hour bucket's
 * utilization dropped to/below the threshold (primary, reliable) OR its
 * `resets_at` rolled forward past `sendAt` by the margin (corroborating).
 * No bucket → not recharged (keep waiting).
 */
export function isRecharged(
  usage: CcbUsageResponse,
  sendAtIso: string,
  opts: RechargeOpts = {},
): boolean {
  const bucket = usage.five_hour;
  if (bucket === null) return false;

  const threshold = opts.utilizationFraction ?? RECHARGE_UTILIZATION_FRACTION;
  const byUtilization = utilizationFraction(bucket.utilization) <= threshold;

  const margin = opts.resetRolloverMarginMs ?? RESET_ROLLOVER_MARGIN_MS;
  const resetsAtMs = Date.parse(bucket.resets_at);
  const sendAtMs = Date.parse(sendAtIso);
  const byRollover =
    !Number.isNaN(resetsAtMs) && !Number.isNaN(sendAtMs) && resetsAtMs > sendAtMs + margin;

  return byUtilization || byRollover;
}

/**
 * The `kind` classifyError attaches to a usage-fetch failure
 * ('network' | 'auth' | 'ccb_missing' | 'npm_missing' | 'unknown'). Carried on
 * FAILED statuses so the webview can localize the reason (e.g. 'network' →
 * "네트워크 연결 에러") instead of surfacing the English `error` text raw.
 */
export type AutoResumeErrorKind = ReturnType<typeof classifyError>['kind'];

/** A single AUTO_RESUME_STATUS progress push. */
export interface AutoResumeStatus {
  sessionId: string;
  scheduleId: string;
  phase: AutoResumeStatusPhase;
  attempt: number;
  nextCheckInMs?: number;
  error?: string;
  /**
   * Present only on a FAILED status caused by a usage-fetch error (not a
   * timeout): the classifyError kind so the webview can map it to a localized
   * message. Absent for timeouts (those carry `error: 'timeout'`).
   */
  errorKind?: AutoResumeErrorKind;
}

/** Everything the hook needs, injected so it is fully unit-testable (no real timers/ccb). */
export interface AutoResumeHookDeps {
  fetchUsage: () => Promise<CcbUsageResponse>;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  pollIntervalMs: number;
  timeoutMs: number;
  broadcast: (status: AutoResumeStatus) => void;
  rechargeOpts?: RechargeOpts;
}

/** Extract a child_process-style errno/exit code so classifyError can label it. */
function errorCode(err: unknown): number | string | undefined {
  if (err instanceof Error) {
    const code = (err as { code?: number | string }).code;
    if (typeof code === 'number' || typeof code === 'string') return code;
  }
  return undefined;
}

/**
 * Build the pre-send gate hook. Polls `fetchUsage` until recharged, timeout, or
 * a fetch error. The engine `await`s this hook, so a long wait is fine — the
 * reservation stays put until we return a verdict.
 */
export function createAutoResumeHook(deps: AutoResumeHookDeps): ScheduleHook {
  return async (msg: ScheduledMessage) => {
    const deadline = deps.now() + deps.timeoutMs;
    let attempt = 0;

    for (;;) {
      attempt += 1;

      let usage: CcbUsageResponse;
      try {
        usage = await deps.fetchUsage();
      } catch (err) {
        // A fetch error is NOT "not recharged" — abort with a human-readable
        // reason (classifyError yields "Network error reaching Anthropic API"
        // for network failures, never a raw errno).
        const info = classifyError(err instanceof Error ? err.message : String(err), errorCode(err));
        deps.broadcast({
          sessionId: msg.sessionId,
          scheduleId: msg.id,
          phase: AutoResumeStatusPhase.FAILED,
          attempt,
          error: info.message,
          errorKind: info.kind,
        });
        return { proceed: false, done: true, error: info.message };
      }

      if (isRecharged(usage, msg.sendAt, deps.rechargeOpts)) {
        deps.broadcast({
          sessionId: msg.sessionId,
          scheduleId: msg.id,
          phase: AutoResumeStatusPhase.PROCEEDING,
          attempt,
        });
        return { proceed: true };
      }

      if (deps.now() >= deadline) {
        deps.broadcast({
          sessionId: msg.sessionId,
          scheduleId: msg.id,
          phase: AutoResumeStatusPhase.FAILED,
          attempt,
          error: 'timeout',
        });
        return { proceed: false, done: true, error: 'timeout' };
      }

      deps.broadcast({
        sessionId: msg.sessionId,
        scheduleId: msg.id,
        phase: AutoResumeStatusPhase.RETRYING,
        attempt,
        nextCheckInMs: deps.pollIntervalMs,
      });
      await deps.sleep(deps.pollIntervalMs);
    }
  };
}

/** Overridable pieces for `registerAutoResumeHook` (production defaults otherwise). */
export interface RegisterAutoResumeOptions {
  fetchUsage?: () => Promise<CcbUsageResponse>;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  pollIntervalMs?: number;
  timeoutMs?: number;
  rechargeOpts?: RechargeOpts;
}

/**
 * Register the AUTO_RESUME pre-send gate on the scheduled-message engine. Called
 * once at server startup. Broadcasts progress via AUTO_RESUME_STATUS so the
 * webview can show live "waiting for quota reset" / "gave up" state.
 */
export function registerAutoResumeHook(
  connections: ConnectionManager,
  options: RegisterAutoResumeOptions = {},
): void {
  const broadcast = (status: AutoResumeStatus): void => {
    connections.broadcastToSession(status.sessionId, MessageType.AUTO_RESUME_STATUS, {
      sessionId: status.sessionId,
      scheduleId: status.scheduleId,
      phase: status.phase,
      attempt: status.attempt,
      nextCheckInMs: status.nextCheckInMs,
      error: status.error,
      errorKind: status.errorKind,
    });
  };

  const hook = createAutoResumeHook({
    fetchUsage: options.fetchUsage ?? runCcbUsage,
    now: options.now ?? Date.now,
    sleep: options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))),
    pollIntervalMs: options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS,
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    broadcast,
    rechargeOpts: options.rechargeOpts,
  });

  registerHook(ScheduledMessageKind.AUTO_RESUME, hook);
}
