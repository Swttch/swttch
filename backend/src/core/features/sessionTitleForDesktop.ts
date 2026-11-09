import { createReadStream } from 'fs';
import { appendFile, open, readdir } from 'fs/promises';
import { createInterface } from 'readline';
import { join } from 'path';
import { extractSessionInfo } from './extractSessionInfo';
import { NO_TITLE } from './resolveSessionTitle';

/**
 * Give a session the title this app shows for it, in the one place Claude Desktop's import reads it from (#647).
 *
 * Desktop's "Import Claude Code CLI sessions" names a session by its `custom-title` entry, and when the transcript
 * holds none, by its first prompt, from which it removes the angle brackets of a tag but keeps the words inside. It
 * does NOT read `ai-title` (measured on Claude Desktop 4.23118 for Windows: a session with an `ai-title` was still
 * imported under its first prompt, a session with a `custom-title` was imported under that title). The IDE context
 * this app puts in front of a prompt (`<ide_opened_file>The user opened the file .env in the IDE. …`) therefore
 * became the title of every imported session, however good the CLI's generated title was. This app itself drops
 * such a tag whole, so its list shows the right name; the transcript has to say the same name for Desktop to show it.
 *
 * The name goes in as a `custom-title` entry, the entry `/rename` writes and every client reads. A rename made
 * afterwards appends a newer entry, and the newest wins everywhere, so this does not stand in the user's way.
 */

/** Entrypoints of sessions this app started (before and after the change that gave it names of its own). */
const OWN_ENTRYPOINTS = new Set(['sdk-cli', 'swttch-jetbrains', 'swttch-standalone']);

/** The longest title written. Desktop cuts a title at 80 characters itself; this only bounds a pathological prompt. */
const MAX_TITLE_LENGTH = 200;

export interface TranscriptTitleState {
  /** The first `entrypoint` the transcript carries. */
  entrypoint: string | null;
  hasCustomTitle: boolean;
}

/** One pass over a transcript, noting only what decides whether a title is written. */
export async function readTranscriptTitleState(file: string): Promise<TranscriptTitleState> {
  const state: TranscriptTitleState = { entrypoint: null, hasCustomTitle: false };
  const rl = createInterface({ input: createReadStream(file, { encoding: 'utf8' }), crlfDelay: Infinity });
  try {
    for await (const line of rl) {
      if (line.startsWith('{"type":"custom-title"')) {
        state.hasCustomTitle = true;
        continue;
      }
      if (state.entrypoint === null) {
        const match = /"entrypoint":"([^"]*)"/.exec(line);
        if (match) state.entrypoint = match[1];
      }
    }
  } finally {
    rl.close();
  }
  return state;
}

/**
 * Whether a transcript needs a title entry written.
 *
 * A session that already carries a `custom-title` is named on both sides, and a name chosen there is never
 * replaced. A session started somewhere else (the terminal, Desktop itself) is not this app's to name.
 */
export function needsDesktopTitle(state: TranscriptTitleState): boolean {
  if (state.entrypoint === null || !OWN_ENTRYPOINTS.has(state.entrypoint)) return false;
  return !state.hasCustomTitle;
}

/** The entry line, newline included. The CLI writes compact JSON, so this does too. */
export function customTitleLine(sessionId: string, title: string): string {
  return `${JSON.stringify({ type: 'custom-title', customTitle: title, sessionId })}\n`;
}

async function endsWithNewline(file: string): Promise<boolean> {
  const handle = await open(file, 'r');
  try {
    const { size } = await handle.stat();
    if (size === 0) return true;
    const last = Buffer.alloc(1);
    await handle.read(last, 0, 1, size - 1);
    return last[0] === 0x0a;
  } finally {
    await handle.close();
  }
}

export interface SessionsTitleUpdate {
  /** Sessions that now carry a `custom-title` entry. */
  titled: string[];
  /** Sessions that could not be read or written. */
  failed: { sessionId: string; error: string }[];
}

export interface WriteDesktopTitlesOptions {
  /** Sessions with a live CLI; their transcripts are left alone. */
  runningSessionIds: ReadonlySet<string>;
  /** Names typed in this app, by session id. */
  overrides: Readonly<Record<string, string>>;
  /** Whether the newest prompt names a session, as the list does. */
  includeLastPrompt: boolean;
}

/** Append the `custom-title` entry to every session of one project folder that needs it. */
export async function writeDesktopTitles(
  sessionsDir: string,
  options: WriteDesktopTitlesOptions,
): Promise<SessionsTitleUpdate> {
  const result: SessionsTitleUpdate = { titled: [], failed: [] };
  let names: string[];
  try {
    names = await readdir(sessionsDir);
  } catch {
    return result;
  }
  for (const name of names) {
    if (!name.endsWith('.jsonl')) continue;
    const sessionId = name.slice(0, -'.jsonl'.length);
    if (options.runningSessionIds.has(sessionId)) continue;
    const file = join(sessionsDir, name);
    try {
      const state = await readTranscriptTitleState(file);
      if (!needsDesktopTitle(state)) continue;

      const info = await extractSessionInfo(file, {
        includeLastPrompt: options.includeLastPrompt,
        override: options.overrides[sessionId],
      });
      const title = info.title.replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE_LENGTH);
      if (info.isSidechain || title === '' || title === NO_TITLE) continue;

      const prefix = (await endsWithNewline(file)) ? '' : '\n';
      await appendFile(file, prefix + customTitleLine(sessionId, title));
      result.titled.push(sessionId);
    } catch (err) {
      result.failed.push({ sessionId, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return result;
}
