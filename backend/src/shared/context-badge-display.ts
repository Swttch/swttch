/**
 * What the context badge under the chat input writes next to its ring:
 * - percent: the share of the window in use (8%)
 * - tokens: the tokens in use (81k), the same whatever the window size is
 * - none: the ring alone
 *
 * The hover text names the tokens, the window and the percentage whichever is
 * chosen, so this only decides what stays on screen (#328).
 *
 * Shared because the backend validates the stored value and the webview renders it.
 */
export enum ContextBadgeDisplay {
  PERCENT = 'percent',
  TOKENS = 'tokens',
  NONE = 'none',
}

/** Every accepted {@link ContextBadgeDisplay} value, for validating what was stored. */
export const CONTEXT_BADGE_DISPLAYS: readonly string[] = Object.values(ContextBadgeDisplay);
