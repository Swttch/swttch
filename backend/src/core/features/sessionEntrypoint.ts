import { createReadStream, createWriteStream } from 'fs';
import { readdir, rename, stat, unlink } from 'fs/promises';
import { once } from 'events';
import { join } from 'path';

/**
 * The `entrypoint` a session carries, and the one-time change of it for sessions that exist already (#647).
 *
 * The CLI writes `"entrypoint":"<name>"` on every line of a session's transcript. A `-p` spawn gets `sdk-cli`, and
 * Claude Desktop's "Import Claude Code CLI sessions" leaves `sdk-cli` out, so a session started from here never
 * reached the Desktop Code tab. Any name that is not on Desktop's list is imported (measured with three different
 * names), so new sessions are started under a name of our own, and the sessions started before that are moved to
 * it by {@link updateSessionsEntrypoint}.
 */

/** What the CLI stamps on a `-p` spawn when nobody names an entrypoint. */
export const SDK_ENTRYPOINT = 'sdk-cli';

/** The name a session started from this app carries: where it was started, not what drives the CLI. */
export function swttchEntrypointName(insideJetBrains: boolean): string {
  return insideJetBrains ? 'swttch-jetbrains' : 'swttch-standalone';
}

/** The CLI writes compact JSON, so the pair has no spaces; a quote inside a message is escaped and never matches. */
const SDK_ENTRYPOINT_PAIR = /"entrypoint":"sdk-cli"/g;

export type TranscriptUpdate =
  /** At least one line carried `sdk-cli`; the file now carries the new name. */
  | { kind: 'updated'; lines: number }
  /** No line carried `sdk-cli`; the file was not touched. */
  | { kind: 'unchanged' }
  /** The file grew or changed while it was being copied, so the copy was dropped and the file left as it was. */
  | { kind: 'changed-meanwhile' };

/** The lines of a stream, each with its own newline, so the copy keeps the original line endings byte for byte. */
async function* linesOf(source: AsyncIterable<string>): AsyncGenerator<string> {
  let carry = '';
  for await (const chunk of source) {
    carry += chunk;
    let at = carry.indexOf('\n');
    while (at !== -1) {
      yield carry.slice(0, at + 1);
      carry = carry.slice(at + 1);
      at = carry.indexOf('\n');
    }
  }
  if (carry !== '') yield carry;
}

/**
 * Rewrite `sdk-cli` to [entrypoint] on every line of one transcript, changing nothing else.
 *
 * The CLI owns the file, so the change goes into a copy beside it and the copy replaces the original in one rename:
 * a failure at any point leaves the original as it was. The caller must have established that no CLI is running the
 * session, since a CLI holds the original open and would keep appending to the file this replaced.
 */
export async function updateTranscriptEntrypoint(file: string, entrypoint: string): Promise<TranscriptUpdate> {
  const before = await stat(file);
  const copy = `${file}.swttch-tmp`;
  const out = createWriteStream(copy, { mode: before.mode & 0o777, flags: 'wx' });
  let replaced = 0;
  let lines = 0;
  try {
    for await (const line of linesOf(createReadStream(file, { encoding: 'utf8' }))) {
      lines += 1;
      const next = line.replace(SDK_ENTRYPOINT_PAIR, () => {
        replaced += 1;
        return `"entrypoint":"${entrypoint}"`;
      });
      if (!out.write(next)) await once(out, 'drain');
    }
    out.end();
    await once(out, 'finish');

    if (replaced === 0) {
      await unlink(copy);
      return { kind: 'unchanged' };
    }

    // A CLI that was started after the caller looked would have appended meanwhile; replacing then would lose that.
    const after = await stat(file);
    if (after.size !== before.size || after.mtimeMs !== before.mtimeMs) {
      await unlink(copy);
      return { kind: 'changed-meanwhile' };
    }

    await rename(copy, file);
    return { kind: 'updated', lines };
  } catch (err) {
    out.destroy();
    await unlink(copy).catch(() => undefined);
    throw err;
  }
}

export interface SessionsEntrypointUpdate {
  /** Sessions whose transcript now carries the new name. */
  updated: string[];
  /** Sessions a CLI is running right now, left alone. */
  running: string[];
  /** Sessions that grew while they were copied, left alone. */
  changedMeanwhile: string[];
  /** Sessions that could not be read or written. */
  failed: { sessionId: string; error: string }[];
}

/**
 * Move every session of one project folder that carries `sdk-cli` to [entrypoint].
 *
 * [runningSessionIds] are the sessions with a live CLI (`claude agents --json`); they are skipped, and the caller
 * must refuse to call this when it cannot tell which ones those are.
 */
export async function updateSessionsEntrypoint(
  sessionsDir: string,
  entrypoint: string,
  runningSessionIds: ReadonlySet<string>,
): Promise<SessionsEntrypointUpdate> {
  const result: SessionsEntrypointUpdate = { updated: [], running: [], changedMeanwhile: [], failed: [] };
  let names: string[];
  try {
    names = await readdir(sessionsDir);
  } catch {
    return result;
  }
  for (const name of names) {
    if (!name.endsWith('.jsonl')) continue;
    const sessionId = name.slice(0, -'.jsonl'.length);
    if (runningSessionIds.has(sessionId)) {
      result.running.push(sessionId);
      continue;
    }
    try {
      const update = await updateTranscriptEntrypoint(join(sessionsDir, name), entrypoint);
      if (update.kind === 'updated') result.updated.push(sessionId);
      else if (update.kind === 'changed-meanwhile') result.changedMeanwhile.push(sessionId);
    } catch (err) {
      result.failed.push({ sessionId, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return result;
}
