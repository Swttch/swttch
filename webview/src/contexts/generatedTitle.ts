/**
 * The title the backend most recently got Claude Code to generate for a session,
 * and when it arrived. The screen draws such a title letter by letter, and only
 * while it is fresh, so reopening a session or reloading the list shows it as it is.
 */
export interface GeneratedSessionTitle {
  sessionId: string;
  title: string;
  /** `Date.now()` at the moment the title arrived. */
  arrivedAt: number;
}

/**
 * When [title] arrived as the title Claude Code generated for [sessionId], or
 * null when it is any other title (typed by the user, read from the list). A row or
 * a header gives this to TypewriterText.
 */
export function generatedTitleArrivedAt(
  generated: GeneratedSessionTitle | null | undefined,
  sessionId: string | null | undefined,
  title: string,
): number | null {
  return generated && generated.sessionId === sessionId && generated.title === title ? generated.arrivedAt : null;
}
