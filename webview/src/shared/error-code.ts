/**
 * Structured codes carried in an ERROR message's `payload.errorCode`, so the
 * webview can react to a failure by kind instead of parsing the human-readable
 * `error` string. Payload sub-classification (not an IPC envelope `type`), kept
 * as an enum so the same token is shared verbatim across backend and webview.
 *
 * NOTE: This file is mirrored 1:1 in `backend/src/shared/error-code.ts`.
 * Any edit here MUST be copied there (see `shared/CLAUDE.md`).
 */
export enum ErrorCode {
  /**
   * The requested action is sponsor-only and the current install has no sponsor
   * entitlement. The webview's global IPC error handler shows the invite toast.
   */
  SPONSOR_REQUIRED = 'SPONSOR_REQUIRED',
}
