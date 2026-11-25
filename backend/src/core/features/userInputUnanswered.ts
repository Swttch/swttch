import { open } from 'fs/promises';

/** How much of the end of a transcript is looked through: a turn's lines are far smaller. */
const TAIL_BYTES = 512 * 1024;

/** Input older than this is not waiting for a turn any more: whatever was to answer it has long begun or been lost. */
const FRESH_MS = 30_000;

/** The line the CLI writes when a turn is stopped by the person: a user entry, but nothing waits for it. */
const INTERRUPT_MARK = '[Request interrupted';

function textOf(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((block) => (block && typeof block === 'object' && typeof (block as { text?: unknown }).text === 'string' ? (block as { text: string }).text : '')).join('');
  }
  return '';
}

/**
 * Whether the last thing written to the transcript of a session is input the CLI has not answered yet: the last
 * `user` or `assistant` line is a `user` line, written a moment ago, and not the mark of an interrupted turn.
 *
 * A message handed to a CLI that is finishing a turn starts the next turn at once, but that turn's first output
 * comes seconds later; in between nothing says it is under way except this line. The backend that runs the CLI says
 * "no turn in flight" for that time, and a screen that believed it would show the work as over in the middle of it.
 *
 * Only the end of the file is read.
 */
export async function userInputUnanswered(file: string, now: number = Date.now()): Promise<boolean> {
  let handle;
  try {
    handle = await open(file, 'r');
    const { size } = await handle.stat();
    const length = Math.min(size, TAIL_BYTES);
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, size - length);
    const lines = buffer.toString('utf8').split('\n');
    // The first line of a tail may be cut in the middle.
    for (let index = lines.length - 1; index >= (length < size ? 1 : 0); index--) {
      const line = lines[index].trim();
      if (!line || !(line.includes('"type":"user"') || line.includes('"type":"assistant"'))) continue;
      let entry: { type?: unknown; timestamp?: unknown; message?: { content?: unknown } };
      try {
        entry = JSON.parse(line);
      } catch {
        continue;
      }
      if (entry.type !== 'user' && entry.type !== 'assistant') continue;
      if (entry.type === 'assistant') return false;
      if (textOf(entry.message?.content).startsWith(INTERRUPT_MARK)) return false;
      const at = typeof entry.timestamp === 'string' ? Date.parse(entry.timestamp) : NaN;
      return Number.isFinite(at) && now - at < FRESH_MS;
    }
    return false;
  } catch {
    return false;
  } finally {
    await handle?.close();
  }
}
