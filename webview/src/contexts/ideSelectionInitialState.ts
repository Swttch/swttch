/**
 * Inputs the chip's starting state is derived from: whether the settings load
 * is still in flight, and the raw `attachEditorContext` value once it lands.
 */
export interface InitialIncludeParams {
  /** True while the settings query has not produced a value yet. */
  isLoading: boolean;
  /** The raw setting value, unvalidated — it comes from a user-editable file. */
  value: unknown;
}

/**
 * Decide whether the editor-context chip starts a session included (file icon)
 * or excluded (eye-off), per #237.
 *
 * Two rules, in order:
 *
 * 1. While the setting is unknown the chip starts EXCLUDED, even though the
 *    default is enabled. The risk is asymmetric: starting included could ship a
 *    file the user meant to keep back, which cannot be undone, whereas starting
 *    excluded costs at most one missed attachment that a resend fixes.
 *
 * 2. Once the setting has arrived, only an explicit `false` disables it.
 *    A missing, null or malformed value leaves the feature on, so a settings
 *    file the user hand-edited into something unreadable never silently turns
 *    the feature off.
 *
 * This governs the START of a session only (`/clear`, reset, new session).
 * Clicking the chip afterwards changes that session alone and is never written
 * back to the settings file — the same contract the model picker and permission
 * mode follow.
 */
export function resolveInitialInclude(params: InitialIncludeParams): boolean {
  const { isLoading, value } = params;
  if (isLoading) return false;
  return value !== false;
}
