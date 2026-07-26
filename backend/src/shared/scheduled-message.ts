/**
 * ScheduledMessage — a "send later" reservation bound to ONE chat session.
 *
 * This is the data contract for the generic scheduled-message engine (the
 * Slack-style "schedule send"): at `sendAt` the backend delivers `message` to
 * the session's Claude CLI process. Reservations are bound to a SESSION (not an
 * account) — a session may hold several independent reservations.
 *
 * A higher-level feature (e.g. "auto-resume") creates a reservation and tags it
 * with `kind` so the engine can pick the right pre-send hook. The engine itself
 * knows nothing about the domain decision (quota reset, etc.); that lives in the
 * hook the higher layer registers.
 *
 * Field names are preserved verbatim end-to-end (data-preservation rule in
 * CLAUDE.md): no renaming or structural editing between backend and webview.
 *
 * NOTE: This file is mirrored 1:1 in `webview/src/shared/scheduled-message.ts`.
 * Any edit here MUST be copied there (see `shared/CLAUDE.md`).
 */

/**
 * Which higher-level feature created a reservation. Used to select the pre-send
 * hook from the engine's per-kind registry. `AUTO_RESUME` is the first member;
 * more are added as new features build on the engine.
 */
export enum ScheduledMessageKind {
  /** Reservation created by the "auto-resume on limit reset" feature (layer 2). */
  AUTO_RESUME = 'AUTO_RESUME',
}

/**
 * Phase of an AUTO_RESUME reservation's pre-send quota poll, carried in the
 * AUTO_RESUME_STATUS push payload. Before delivering an auto-resume reservation
 * the engine's hook polls the usage battery (ccb) waiting for the quota to
 * recharge; these phases let the webview show live progress. This is a payload
 * sub-classification (not an IPC envelope `type`), kept as an enum so the same
 * token is shared verbatim across backend and webview.
 */
export enum AutoResumeStatusPhase {
  /** The hook is polling ccb and still waiting for the quota to recharge. */
  RETRYING = 'RETRYING',
  /** The quota recharged; the reservation is being delivered now. */
  PROCEEDING = 'PROCEEDING',
  /** The hook gave up (poll timed out or a usage-fetch error occurred); the reservation was dropped. */
  FAILED = 'FAILED',
}

export interface ScheduledMessage {
  /** Reservation id (unique per reservation). */
  id: string;
  /** The session this reservation is bound to. */
  sessionId: string;
  /** ISO 8601 timestamp at which the message should be sent. */
  sendAt: string;
  /** The message to deliver at `sendAt` (e.g. "continue"). */
  message: string;
  /** Which higher-level feature created this reservation (selects the pre-send hook). */
  kind: ScheduledMessageKind;
  /** ISO 8601 timestamp at which the reservation was created. */
  createdAt: string;
}
