/**
 * Structured codes carried in an ERROR message's `payload.errorCode`, so the
 * webview can react to a failure by kind instead of parsing the human-readable
 * `error` string. Payload sub-classification (not an IPC envelope `type`), kept
 * as an enum so the same token is shared verbatim across backend and webview.
 *
 * NOTE: This file is mirrored 1:1 in `webview/src/shared/error-code.ts`.
 * Any edit here MUST be copied there (see `shared/CLAUDE.md`).
 */
export enum ErrorCode {
  /**
   * The requested action is sponsor-only and the current install has no sponsor
   * entitlement. The webview's global IPC error handler shows the invite toast.
   */
  SPONSOR_REQUIRED = 'SPONSOR_REQUIRED',

  /**
   * A sponsor key was checked against www and www answered that it is not a
   * valid key. An authoritative "no" — the key really is wrong (typo, revoked,
   * belongs to nobody), so asking the user to re-check what they typed is the
   * right advice.
   */
  SPONSOR_KEY_INVALID = 'SPONSOR_KEY_INVALID',

  /**
   * A sponsor key could NOT be checked because www was never reached — a
   * transport failure, a non-2xx response, a blocked/proxied network. This says
   * nothing about the key itself, so the user must not be told it is invalid;
   * the fix is on the network side (corporate proxy, firewall, TLS inspection).
   *
   * Kept distinct from SPONSOR_KEY_INVALID because the two need opposite advice,
   * and collapsing them sends users hunting for a typo in a key that is fine.
   */
  SPONSOR_VERIFY_UNREACHABLE = 'SPONSOR_VERIFY_UNREACHABLE',
}
