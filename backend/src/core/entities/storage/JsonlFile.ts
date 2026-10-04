import { appendFile, mkdir, open, readFile } from 'fs/promises';
import { dirname } from 'path';
import { atomicWriteFile, retryTransient, runExclusive } from '../../features/atomic-json';

/**
 * A file that exists but cannot be read.
 *
 * Reading refuses rather than answering "empty": an empty answer would look like
 * every row was lost, and the next write would then replace the file with it.
 */
export class JsonlFileUnreadableError extends Error {
  constructor(
    readonly filePath: string,
    readonly reason: string,
  ) {
    super(`file ${filePath} could not be read (${reason})`);
    this.name = 'JsonlFileUnreadableError';
  }
}

/** What reading a row file found. */
export class JsonlSnapshot {
  constructor(
    /** The parsed JSON value of every line that is JSON, in file order. */
    readonly values: unknown[],
    /**
     * Lines that are not JSON at all, kept exactly as written so that a rewrite can
     * put them back. A line the program cannot understand is not the program's to
     * throw away.
     */
    readonly unparseable: string[],
  ) {}

  /** How many lines the file holds, blank ones not counted. */
  get lineCount(): number {
    return this.values.length + this.unparseable.length;
  }
}

/**
 * What a read-modify-write decided to do with the file, and the answer it hands
 * back to its caller.
 */
export class JsonlEdit<T> {
  private constructor(
    readonly kind: 'keep' | 'append' | 'rewrite',
    readonly lines: string[],
    readonly result: T,
  ) {}

  /** Leave the file as it is. */
  static keep<T>(result: T): JsonlEdit<T> {
    return new JsonlEdit('keep', [], result);
  }

  /** Add [values] after the last line, one line each. */
  static append<T>(values: unknown[], result: T): JsonlEdit<T> {
    return new JsonlEdit('append', values.map((value) => JSON.stringify(value)), result);
  }

  /** Replace the whole file with [lines]. */
  static rewrite<T>(lines: string[], result: T): JsonlEdit<T> {
    return new JsonlEdit('rewrite', lines, result);
  }
}

/**
 * One table's file: a line of JSON per row.
 *
 * Why a line each: adding a row is writing one line at the end, which costs the
 * same however many rows the file already holds, and reading can stop as soon as
 * it has what it needs. A file that is one JSON array has to be read whole and
 * written whole for every row that is added.
 *
 * What a reader may count on:
 *
 * - A line that is not JSON does not make the file unreadable. It is set aside and
 *   written back by the next rewrite, so one damaged line costs that line and
 *   nothing else.
 * - A last line cut short by a process that died while writing it is such a line.
 *   The next append starts on a fresh line instead of gluing onto it.
 * - Blank lines are skipped, and a `\r` before the line break (a Windows editor)
 *   is not part of the line.
 *
 * What a row means (the number it is found by, which of two lines with the same
 * number wins, the line that deletes a row) is the collection's concern. This
 * class only knows lines.
 *
 * Every write goes through one queue per path, so two writers of this process
 * never interleave. Writers of another process are not queued: a rewrite replaces
 * the file by a rename and so is atomic, and an append is a single write of whole
 * lines.
 */
export class JsonlFile {
  constructor(readonly filePath: string) {}

  /**
   * Read every line. An absent file is an empty one. Throws
   * {@link JsonlFileUnreadableError} when the file exists and cannot be read.
   */
  async read(): Promise<JsonlSnapshot> {
    let raw: string;
    try {
      raw = await retryTransient(() => readFile(this.filePath, 'utf-8'));
    } catch (err) {
      if (errorCode(err) === 'ENOENT') return new JsonlSnapshot([], []);
      throw new JsonlFileUnreadableError(this.filePath, err instanceof Error ? err.message : String(err));
    }

    const values: unknown[] = [];
    const unparseable: string[] = [];
    for (const segment of raw.split('\n')) {
      const line = segment.endsWith('\r') ? segment.slice(0, -1) : segment;
      if (line.trim() === '') continue;
      try {
        values.push(JSON.parse(line));
      } catch {
        unparseable.push(line);
      }
    }
    return new JsonlSnapshot(values, unparseable);
  }

  /**
   * Add [values] after the last line, one line each, without reading the file.
   * Nothing is written for an empty list.
   */
  async append(values: unknown[]): Promise<void> {
    if (values.length === 0) return;
    await runExclusive(this.filePath, () => this.appendNow(values.map((value) => JSON.stringify(value))));
  }

  /**
   * Read the file, let [decide] say what to do with it, and do that, all before
   * any other write of this process to the same file.
   *
   * [decide] is given what was just read, so a decision that depends on the rows
   * already there (add this one unless it is there already) cannot be overtaken.
   */
  async update<T>(decide: (snapshot: JsonlSnapshot) => JsonlEdit<T>): Promise<T> {
    return runExclusive(this.filePath, async () => {
      const edit = decide(await this.read());
      if (edit.kind === 'append') await this.appendNow(edit.lines);
      if (edit.kind === 'rewrite') {
        await atomicWriteFile(this.filePath, edit.lines.length === 0 ? '' : edit.lines.join('\n') + '\n');
      }
      return edit.result;
    });
  }

  private async appendNow(lines: string[]): Promise<void> {
    if (lines.length === 0) return;
    await mkdir(dirname(this.filePath), { recursive: true });
    const lead = (await this.lacksFinalLineBreak()) ? '\n' : '';
    // Another process may be replacing the file at this moment (a rename over a file
    // that is open is refused on Windows), so a refusal is tried again before it is a failure.
    await retryTransient(() => appendFile(this.filePath, lead + lines.join('\n') + '\n', 'utf-8'));
  }

  /** True when the file has content and its last byte is not a line break. */
  private async lacksFinalLineBreak(): Promise<boolean> {
    let handle;
    try {
      handle = await open(this.filePath, 'r');
    } catch (err) {
      if (errorCode(err) === 'ENOENT') return false;
      throw err;
    }
    try {
      const { size } = await handle.stat();
      if (size === 0) return false;
      const last = Buffer.alloc(1);
      await handle.read(last, 0, 1, size - 1);
      return last[0] !== 0x0a;
    } finally {
      await handle.close();
    }
  }
}

function errorCode(err: unknown): string | undefined {
  return typeof err === 'object' && err !== null && 'code' in err
    ? String((err as { code: unknown }).code)
    : undefined;
}
