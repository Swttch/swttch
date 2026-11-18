import { open } from 'fs/promises';

/** How much of the end of a transcript is looked through for the last response: a turn's lines are far smaller. */
const TAIL_BYTES = 512 * 1024;

/**
 * When the last response of a session was written (the time of the last `assistant` line of its transcript), in
 * milliseconds; 0 when there is none or the file is not there.
 *
 * Only the end of the file is read: a transcript grows to many megabytes, and what is asked for is at its end.
 */
export async function lastResponseAt(file: string): Promise<number> {
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
      if (!line || !line.includes('"assistant"')) continue;
      try {
        const entry = JSON.parse(line) as { type?: unknown; timestamp?: unknown };
        if (entry.type !== 'assistant' || typeof entry.timestamp !== 'string') continue;
        const at = Date.parse(entry.timestamp);
        if (Number.isFinite(at)) return at;
      } catch {
        // A line that does not parse is not one to take a time from.
      }
    }
    return 0;
  } catch {
    return 0;
  } finally {
    await handle?.close();
  }
}
