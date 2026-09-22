/**
 * Why dictation could not start, carried in a START_DICTATION ack's
 * `payload.errorKind` and in GET_DICTATION_AVAILABILITY's `payload.reason`.
 *
 * Payload sub-classification (not an IPC envelope `type`), kept as an enum so
 * the same token is shared verbatim across backend and webview. Codes rather
 * than sentences: the webview decides what to say and in which language, and it
 * must not have to pattern-match an English message to know which case it has.
 *
 * NOTE: This file is mirrored 1:1 in `backend/src/shared/dictation.ts`.
 * Any edit here MUST be copied there (see `shared/CLAUDE.md`).
 */
export enum DictationErrorKind {
  /**
   * @swttch/extend-kit is not installed at all. The UI can offer to install it.
   *
   * Narrow on purpose. This one value used to cover three different situations —
   * absent, too old, and present but impossible to run — and the wording it
   * carried ("not installed") was wrong for two of them. A Windows reporter with
   * a working, current kit was told it was missing, and had to read the shipped
   * `backend.mjs` himself to find out that the real failure was a command line
   * cmd.exe had torn apart (#471). Each of the three now names itself.
   */
  KIT_MISSING = 'kit_missing',

  /**
   * The kit is installed and runs, but does not advertise a capability
   * dictation requires.
   *
   * Told apart from KIT_MISSING because "install it" is the wrong instruction
   * for something already installed, which is the shape of mistake #355 was
   * about. The button behind it is the same one — an install at `@latest`
   * updates an existing kit — but the sentence beside the button is not.
   */
  KIT_TOO_OLD = 'kit_too_old',

  /**
   * The kit is installed, and asking it what it supports failed.
   *
   * Reported with whatever the failed run said, verbatim. We cannot name the
   * cause: the one measured instance is a Windows path with a space in it, and
   * the next may be a permission, an antivirus, or a broken install. What must
   * not happen again is the failure being recorded as an empty capability list
   * and then re-told as "the kit is missing" (#471).
   */
  KIT_UNUSABLE = 'kit_unusable',

  /**
   * The kit is installed, but this machine holds no Claude account login for it
   * to authorize with.
   *
   * The transcription socket is opened with `Authorization: Bearer <token>`,
   * where the token is the OAuth access token a Claude account login leaves
   * behind. A machine authenticated only by ANTHROPIC_API_KEY has no such token
   * and lands here. Telling that user to install something, or showing them the
   * raw failure, sends them hunting in the wrong place (#355).
   *
   * ## Why we do not simply send `x-api-key` instead
   *
   * Because no official Claude Code client does, and we follow the CLI rather
   * than invent around it. The official CLI carries a dedicated failure for this
   * exact case, `[voice_stream] No OAuth token available`, so it too declines
   * before connecting rather than falling back to an API key it is perfectly
   * capable of sending elsewhere.
   *
   * UNVERIFIED, deliberately: whether the endpoint would ACCEPT `x-api-key` has
   * never been measured, here or anywhere we can see, because no client asks.
   * So "an API key cannot dictate" is a statement about every Claude Code
   * client, which is what a user experiences, and NOT a measured fact about the
   * service. Anyone tempted to add an API-key path should measure the endpoint
   * first, and then still weigh doing something the official clients refuse to.
   */
  NOT_LOGGED_IN = 'not_logged_in',

  /** Anything else, reported together with whatever the failure said. */
  UNKNOWN = 'unknown',
}
