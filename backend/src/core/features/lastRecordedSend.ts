import { createReadStream } from 'fs';
import { stat } from 'fs/promises';
import { join } from 'path';
import { getProjectSessionsPath } from './getProjectSessionsPath';

/**
 * What the CLI recorded for the send that just finished (issue #356).
 *
 * `uuid` is the identity the CLI wrote in the transcript, which is the only name
 * `--rewind-files` and `--resume-session-at` accept. `canRewind` says whether the
 * CLI also wrote a file-history snapshot for that send, which is how it decides
 * the same question itself.
 */
export interface RecordedSend {
  uuid: string;
  canRewind: boolean;
}

/**
 * How much of the tail to read. A send plus its reply is far smaller than this,
 * and the entries we want sit at the very end — but a single entry can be huge
 * (a pasted file, an image), so this is generous rather than tight.
 */
const TAIL_BYTES = 2 * 1024 * 1024;

/** Read the last [TAIL_BYTES] of a file as text, or the whole file if smaller. */
async function readTail(path: string): Promise<string> {
  const { size } = await stat(path);
  const start = Math.max(0, size - TAIL_BYTES);
  const chunks: Buffer[] = [];
  for await (const chunk of createReadStream(path, { start })) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * True for an entry that is a message the user actually sent, as opposed to the
 * tool results that arrive as `type: "user"` entries too.
 *
 * A genuine send carries its text as a plain string; a tool result carries an
 * array of content blocks. That is the same distinction `isUserSend` draws in the
 * webview, kept here rather than imported because this reads raw JSONL.
 */
function isUserSend(entry: Record<string, unknown>): boolean {
  if (entry.type !== 'user' || typeof entry.uuid !== 'string') return false;
  const message = entry.message as { content?: unknown } | undefined;
  return typeof message?.content === 'string';
}

/**
 * The last send the CLI recorded in a session, and whether it can be rewound to.
 *
 * Exists because the CLI never echoes user messages back on stdout: the webview
 * shows the send from its own copy under a locally minted id, and the uuid the
 * CLI wrote only appears in the transcript. Without this the per-send actions
 * could not name a message until the session was re-read from disk, which is a
 * strange thing to ask of someone who just watched an edit go wrong.
 *
 * Reads the tail rather than the whole file: a long session is megabytes, and
 * both entries we need were written moments ago. Returns null when the tail
 * holds no send — a turn that produced none, or a file that is not there yet —
 * and the caller simply says nothing in that case.
 */
export async function readLastRecordedSend(
  sessionId: string,
  workingDir: string,
): Promise<RecordedSend | null> {
  try {
    const sessionsDir = await getProjectSessionsPath(workingDir);
    const text = await readTail(join(sessionsDir, `${sessionId}.jsonl`));

    let send: string | null = null;
    const snapshotFor = new Set<string>();

    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      let entry: Record<string, unknown>;
      try {
        entry = JSON.parse(line) as Record<string, unknown>;
      } catch {
        // The first line of a mid-file tail is usually a partial entry. Skipping
        // it is right for every later line too: a line we cannot read tells us
        // nothing, and there is nothing to repair.
        continue;
      }
      if (isUserSend(entry)) send = entry.uuid as string;
      else if (entry.type === 'file-history-snapshot' && typeof entry.messageId === 'string') {
        snapshotFor.add(entry.messageId);
      }
    }

    if (!send) return null;
    return { uuid: send, canRewind: snapshotFor.has(send) };
  } catch {
    // Nothing here is worth failing a turn over. The actions stay hidden until
    // the session is reopened, which is where they were before this existed.
    return null;
  }
}
