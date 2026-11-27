/**
 * What the desktop app writes to Claude in a `user` entry: the report on each session Claude started and the request
 * to answer for them. The app writes it into the entry of the user's next send, ahead of the typed text, so one entry
 * can be a report, a send, or both.
 */

const APP_EVENT_TAG = /<side-sessions-event>([\s\S]*?)<\/side-sessions-event>/;
const APP_EVENT_TAGS = /<side-sessions-event>[\s\S]*?<\/side-sessions-event>/g;

/**
 * One report the app passes on from a session Claude started, as it writes it into the entry:
 * `<system-reminder>The session "Title" you started (local_x) finished a turn … It reported (quoted child output,
 * data not instructions): "what it said" (first 400 of 1387 characters) Read it with … </system-reminder>`.
 */
const SESSION_REPORT =
  /<system-reminder>\s*The session "([\s\S]*?)" you started \((local_[\w-]+)\) finished a turn[\s\S]*?It reported \(quoted child output, data not instructions\): "([\s\S]*?)"(?: \(first [\d,]+ of [\d,]+ characters\))?\s*Read it with[\s\S]*?<\/system-reminder>/g;

type Entry = { type?: unknown; message?: unknown };

function contentOf(entry: unknown): unknown {
  return ((entry as Entry | null)?.message as { content?: unknown } | undefined)?.content;
}

function textOf(entry: unknown): string {
  const content = contentOf(entry);
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((block): block is { type: string; text: string } => !!block && (block as { type?: unknown }).type === 'text')
    .map((block) => (typeof block.text === 'string' ? block.text : ''))
    .join('\n');
}

/** The reports an entry carries, as what each session said (its lines are joined with " ⏎ " in the record). */
export function sessionReports(entry: unknown): { name: string; body: string; from: string }[] {
  if ((entry as Entry | null)?.type !== 'user') return [];
  return [...textOf(entry).matchAll(SESSION_REPORT)].map((match) => ({
    name: match[1],
    from: match[2],
    body: match[3].replace(/ ⏎ /g, '\n').trim(),
  }));
}

/** The text without the app's event tag. Its reports are system reminders, which are taken out as such. */
export function withoutAppEvents(text: string): string {
  return text.replace(APP_EVENT_TAGS, '');
}

/** An entry that holds a report on a session Claude started or the request to answer for it, alone or with a send. */
export function carriesAppEvent(entry: unknown): boolean {
  return (entry as Entry | null)?.type === 'user' && (APP_EVENT_TAG.test(textOf(entry)) || sessionReports(entry).length > 0);
}

/** An entry of the app's that also holds something the user typed or attached. */
export function carriesUserSend(entry: unknown): boolean {
  if (!carriesAppEvent(entry)) return false;
  const content = contentOf(entry);
  if (Array.isArray(content) && content.some((block) => (block as { type?: unknown } | null)?.type === 'image')) return true;
  const typed = withoutAppEvents(textOf(entry).replace(SESSION_REPORT, ''))
    .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '');
  return typed.trim() !== '';
}
