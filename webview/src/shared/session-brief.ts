/**
 * The brief a session is started with by another session: Claude Desktop sends it as the first user message,
 * a plain-text frame with no tag around it. Desktop draws it as a "Task" card and a "Context" card instead of
 * one long bubble, and so do we.
 *
 * ```
 * Background (from the session that started this one):
 * <background>
 *
 * Task:
 * <task>
 *
 * Shared notes folder for this group of sessions (...): <path>     <- optional last paragraph
 * ```
 *
 * The rules below are Desktop's own, so a message it would draw as plain text stays a plain bubble here too.
 */

/** An older form of the frame that puts a task header ahead of the background header. */
const LEGACY_TASK_HEADER = 'Task (from the session that started this one):\n';
const BACKGROUND_HEADER = 'Background (from the session that started this one):\n';
const TASK_MARK = '\n\nTask:\n';
const NOTES_PARAGRAPH = "Shared notes folder for this group of sessions (outside the repo; read siblings' notes there, leave hand-over notes or large findings there instead of pasting them into messages): ";

export interface SessionBrief {
  task: string;
  /** The background, then the shared notes folder paragraph when the message ends with one. */
  context: string;
}

/** The two cards of a session brief, or null when the text is anything else. */
export function parseSessionBrief(text: string): SessionBrief | null {
  const body = text.startsWith(LEGACY_TASK_HEADER) ? text.slice(LEGACY_TASK_HEADER.length) : text;
  const markAt = body.indexOf(TASK_MARK, BACKGROUND_HEADER.length);
  // The `Task:` line must be there exactly once, or the frame is something someone typed.
  if (!body.startsWith(BACKGROUND_HEADER) || markAt === -1 || markAt !== body.lastIndexOf(TASK_MARK)) return null;

  const background = body.slice(BACKGROUND_HEADER.length, markAt);
  const rest = body.slice(markAt + TASK_MARK.length);
  const lastParagraphAt = rest.lastIndexOf('\n\n');
  const lastParagraph = rest.slice(lastParagraphAt + 2);
  const endsWithNotes = lastParagraphAt !== -1 && lastParagraph.startsWith(NOTES_PARAGRAPH) && !lastParagraph.includes('\n');

  const task = endsWithNotes ? rest.slice(0, lastParagraphAt) : rest;
  const context = endsWithNotes ? `${background}\n\n${lastParagraph}` : background;
  if (task.trim() === '' || context.trim() === '') return null;
  return { task, context };
}
