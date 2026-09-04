/**
 * Marker for a tool_result that represents a USER DECISION (a denied permission),
 * not a tool/server failure. When a user denies a tool we still send the SDK a
 * tool_result with `is_error: true` (the model must know the tool did not run),
 * but we prefix the content with this marker so the webview can render it as a
 * neutral "Declined" note instead of a red error — and because the marker lives
 * in the persisted content, the distinction survives a reload.
 *
 * Mirrored 1:1 in `webview/src/shared/` and `backend/src/shared/` (see CLAUDE.md).
 */
// A leading zero-width sentinel (U+200B) makes this marker practically impossible
// for a real tool output / error string to reproduce by accident, closing the
// in-band-signaling false-positive gap. It stays invisible to the model that
// reads this content, and JS `String.prototype.trim()` does NOT strip U+200B, so
// it survives the CLI round-trip into the persisted tool_result content.
const DECLINE_SENTINEL = '\u200B';
export const USER_DECLINED_PREFIX = `${DECLINE_SENTINEL}User declined to run this tool.`;
const INSTEAD_SEPARATOR = ' Asked Claude instead: ';

/** Build the denial tool_result content (model-friendly and webview-detectable). */
export function buildUserDeclinedContent(reason?: string): string {
    const r = (reason ?? '').trim();
    return r ? `${USER_DECLINED_PREFIX}${INSTEAD_SEPARATOR}${r}` : USER_DECLINED_PREFIX;
}

/**
 * The decline content as it was recorded, minus the invisible sentinel.
 *
 * The sentinel exists to make the marker unmistakable in code; it is not part of
 * what the decision says. Everything after it is the CLI's own wording and is
 * shown verbatim — deliberately NOT swapped for a translated sentence of ours,
 * even when the interface is running in another language.
 *
 * We are relaying the CLI's output, not authoring it, so which language that
 * message is in is not ours to answer for. Translating it would also mean a
 * reader comparing this against the same session in their terminal finds two
 * different sentences for one event.
 */
export function declineDisplayText(content: string): string {
    return content.startsWith(DECLINE_SENTINEL) ? content.slice(DECLINE_SENTINEL.length) : content;
}

/**
 * If `content` is a user-decline marker, return the user's instruction (or '' when
 * they declined without one); otherwise null. Used by the webview to render the
 * decision distinctly from a real error.
 */
export function parseUserDeclined(content: unknown): {instruction: string} | null {
    if (typeof content !== 'string' || !content.startsWith(USER_DECLINED_PREFIX)) return null;
    const rest = content.slice(USER_DECLINED_PREFIX.length);
    return rest.startsWith(INSTEAD_SEPARATOR)
        ? {instruction: rest.slice(INSTEAD_SEPARATOR.length).trim()}
        : {instruction: ''};
}
