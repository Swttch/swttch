/**
 * The one place that decides what a session is called.
 *
 * Every screen that shows a session's name (the header, the session list, the
 * editor tab, notifications) gets it from here, whether the name was read when
 * the list loaded or pushed live while a session ran. A name decided anywhere
 * else would be able to disagree with this one, so no other code picks between
 * these sources.
 *
 * The order is the one the Claude Code extensions for VS Code and Cursor and the
 * desktop app list a session by, so one session reads the same in every client:
 *   1. a name the user typed in this app (kept beside the transcript)
 *   2. a name chosen with `/rename` (custom-title)
 *   3. the title the CLI generated from the conversation (ai-title)
 *   4. the newest prompt (last-prompt), when the setting allows it
 *   5. a summary entry
 *   6. the first prompt
 *
 * A source that holds nothing, or only blanks, is skipped: an empty string must
 * not stop the walk down to the next source.
 */

export interface SessionTitleSources {
  override?: string | null;
  customTitle?: string | null;
  aiTitle?: string | null;
  /** Already left out (null) when the setting that allows the newest prompt is off. */
  lastPrompt?: string | null;
  summary?: string | null;
  firstPrompt?: string | null;
}

/** What a session with no usable source at all is called. */
export const NO_TITLE = 'No title';

function filled(value: string | null | undefined): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

export function resolveSessionTitle(sources: SessionTitleSources): string {
  return (
    filled(sources.override) ??
    filled(sources.customTitle) ??
    filled(sources.aiTitle) ??
    filled(sources.lastPrompt) ??
    filled(sources.summary) ??
    filled(sources.firstPrompt) ??
    NO_TITLE
  );
}
