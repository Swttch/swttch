import { open } from 'node:fs/promises';
import type { SessionMessage } from './sessionIndex';

/** How much of the file's end is read at a time. */
const CHUNK_BYTES = 256 * 1024;
/** The most of the file's end that is read for one answer, whatever the lines in it are like (a line can hold a picture). */
const MAX_BYTES = 16 * 1024 * 1024;

const NEWLINE = 0x0a;
/** What a line that is a send or a reply says somewhere in it (the CLI writes it without the spaces; a reader should not rely on that). */
const MESSAGE_TYPE = /"type"\s*:\s*"(?:assistant|user)"/;

function isMessage(entry: SessionMessage): boolean {
  return entry.type === 'user' || entry.type === 'assistant';
}

/**
 * The newest `limit` messages (what a person sent, what the model wrote) of a session's record, read from the end of
 * the file: the lines it takes are the ones it parses, and nothing before them is read.
 *
 * Another way in is `loadSessionMessages`, which holds the whole record as an index (one small record per entry) so
 * that any page of it can be cut out. That is the right thing for a session someone reads, and the wrong thing for
 * asking "what is it doing now" of a session every couple of seconds: the index of a session that is not read again
 * is built whole (about 0.4s for a 100 MB record), and it takes a place among the few indexes that are kept, which
 * are the ones of the sessions the person has open. This reads the end of the file, so the cost is the size of the
 * answer and not the age of the session.
 *
 * The entries are the record's own, parsed and not touched. A last line that is not finished (the CLI is writing it
 * as this reads) is left out, as is any line that is not JSON. Entries that are neither a send nor a reply (the
 * record's own bookkeeping) are left out too: they are not what a caller of this asks for, and a record keeps many.
 *
 * Throws with code ENOENT when the session has no record.
 */
export async function readSessionTail(file: string, limit: number): Promise<SessionMessage[]> {
  const handle = await open(file, 'r');
  try {
    const { size } = await handle.stat();
    let position = size;
    let read = 0;
    // Bytes before the first line break seen so far: the end of a line whose start is further back.
    let rest: Buffer = Buffer.alloc(0);
    // Newest first, as they are met.
    const found: SessionMessage[] = [];

    while (position > 0 && found.length < limit && read < MAX_BYTES) {
      const length = Math.min(CHUNK_BYTES, position);
      position -= length;
      const chunk = Buffer.alloc(length);
      await handle.read(chunk, 0, length, position);
      read += length;

      const buffer = Buffer.concat([chunk, rest]);
      // Before the first line break the line may start in a chunk not read yet; it waits, until position is 0.
      const firstBreak = position > 0 ? buffer.indexOf(NEWLINE) : -1;
      if (position > 0 && firstBreak === -1) {
        rest = buffer;
        continue;
      }
      const complete = position > 0 ? buffer.subarray(firstBreak + 1) : buffer;
      rest = position > 0 ? buffer.subarray(0, firstBreak) : Buffer.alloc(0);

      const lines = complete.toString('utf8').split('\n');
      for (let index = lines.length - 1; index >= 0 && found.length < limit; index--) {
        const line = lines[index];
        // A line that never says it is a send or a reply is not read as JSON: a record keeps large lines of its own
        // bookkeeping, and the ones that say so are checked for real below.
        if (!MESSAGE_TYPE.test(line)) continue;
        let entry: SessionMessage;
        try {
          entry = JSON.parse(line) as SessionMessage;
        } catch {
          // The line the CLI is writing right now, or one that is not JSON: not an entry.
          continue;
        }
        if (entry && typeof entry === 'object' && isMessage(entry)) found.push(entry);
      }
    }

    return found.reverse();
  } finally {
    await handle.close();
  }
}
