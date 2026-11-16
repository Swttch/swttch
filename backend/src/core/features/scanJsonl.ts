import { createReadStream } from 'fs';

/** One line of a JSONL file: where it is, and what it says. */
export interface JsonlLine {
  /** Byte offset of the line's first byte in the file. */
  offset: number;
  /** Bytes in the line, not counting the newline that ends it. */
  length: number;
  /** The line decoded as UTF-8, with the line break (and a carriage return in front of it) removed. */
  text: string;
  /** The line ends in a newline. The last line of a file that is still being written may not. */
  terminated: boolean;
}

export interface JsonlScan {
  /**
   * The offset just after the last line that ends in a newline. A line that does not end in one may still
   * be growing, so a scan that continues later starts here, not at the end of the file.
   */
  completeThrough: number;
  /** The file's size when the scan ended. */
  size: number;
}

const NEWLINE = 0x0a;
const CARRIAGE_RETURN = 0x0d;

/**
 * Read a JSONL file from `fromOffset` and call `onLine` with every line that is not blank, together with
 * where in the file it is (#680).
 *
 * The position is what lets a transcript be kept as an index and read page by page: a page is a few byte
 * ranges, not the whole file parsed. The file is read as bytes and split on the newline byte, so a
 * multi-byte character is never cut, and an offset is a real position in the file.
 *
 * A stream, not `readFile`: a session log can be hundreds of megabytes, and nothing here holds more than a
 * chunk and the line being assembled.
 */
export async function scanJsonlLines(
  filePath: string,
  fromOffset: number,
  onLine: (line: JsonlLine) => void,
): Promise<JsonlScan> {
  return new Promise<JsonlScan>((resolve, reject) => {
    const stream = createReadStream(filePath, { start: fromOffset });
    // The bytes of a line that a chunk ended in the middle of, and where it began.
    let pending: Buffer[] = [];
    let pendingLength = 0;
    let lineStart = fromOffset;
    let position = fromOffset;
    let completeThrough = fromOffset;

    const emit = (bytes: Buffer, terminated: boolean) => {
      let end = bytes.length;
      if (end > 0 && bytes[end - 1] === CARRIAGE_RETURN) end -= 1;
      const text = bytes.toString('utf8', 0, end);
      if (text.trim() === '') return;
      onLine({ offset: lineStart, length: bytes.length, text, terminated });
    };

    stream.on('data', (chunk: string | Buffer) => {
      const buffer = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
      let from = 0;
      for (let at = buffer.indexOf(NEWLINE, from); at !== -1; at = buffer.indexOf(NEWLINE, from)) {
        const piece = buffer.subarray(from, at);
        const line = pending.length > 0 ? Buffer.concat([...pending, piece], pendingLength + piece.length) : piece;
        pending = [];
        pendingLength = 0;
        emit(line, true);
        position += at - from + 1;
        lineStart = position;
        completeThrough = position;
        from = at + 1;
      }
      if (from < buffer.length) {
        const rest = Buffer.from(buffer.subarray(from));
        pending.push(rest);
        pendingLength += rest.length;
        position += buffer.length - from;
      }
    });
    stream.on('error', reject);
    stream.on('end', () => {
      if (pendingLength > 0) emit(Buffer.concat(pending, pendingLength), false);
      resolve({ completeThrough, size: position });
    });
  });
}
