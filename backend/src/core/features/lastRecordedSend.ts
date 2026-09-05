import { createReadStream } from 'fs';
import { stat } from 'fs/promises';
import { join } from 'path';
import { getProjectSessionsPath } from './getProjectSessionsPath';
import { chainStampsPermissionMode, isTypedPrompt } from './loadPromptHistory';
import type { SessionMessage } from './loadSessionMessages';

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
  /**
   * The prompt text, so the webview can find which of its own messages this is
   * rather than assuming it is the last one. A turn can be followed by entries
   * that look like sends (a `/model` switch writes three of them), and matching
   * by position attached the uuid to the wrong message.
   */
  text: string;
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

/** The prompt text of an entry, flattened the way the webview shows it. */
function promptTextOf(entry: SessionMessage): string {
  const message = entry.message as { content?: unknown } | undefined;
  const content = message?.content;
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((b): b is Record<string, unknown> => !!b && typeof b === 'object')
    .filter((b) => b.type === 'text')
    .map((b) => (typeof b.text === 'string' ? b.text : ''))
    .join('\n');
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

    const entries: SessionMessage[] = [];
    const snapshotFor = new Set<string>();

    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      let entry: SessionMessage;
      try {
        entry = JSON.parse(line) as SessionMessage;
      } catch {
        // The first line of a mid-file tail is usually a partial entry. Skipping
        // it is right for every later line too: a line we cannot read tells us
        // nothing, and there is nothing to repair.
        continue;
      }
      entries.push(entry);
      if (entry.type === 'file-history-snapshot' && typeof entry.messageId === 'string') {
        snapshotFor.add(entry.messageId);
      }
    }

    /*
     * `isTypedPrompt` rather than "is a user entry with string content".
     *
     * Most `user` entries are not prompts, and the ones that fool a naive test
     * are exactly the ones that follow a turn: a `/model` switch writes
     * `<local-command-caveat>`, `<command-name>` and `<local-command-stdout>`
     * entries, all `type: "user"` with plain string content. Taking the last of
     * those as "the send that just finished" reported a uuid the user never
     * typed, and the actions went missing on the message they belonged to.
     *
     * That test already exists with the measurements behind it (#396), so it is
     * reused rather than approximated. The stamping question is answered from
     * the tail, which is where any recent entry is; a tail with none degrades to
     * the other nets rather than rejecting everything.
     */
    const stamped = chainStampsPermissionMode(entries);
    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i];
      if (typeof entry.uuid !== 'string') continue;
      if (!isTypedPrompt(entry, stamped)) continue;
      return {
        uuid: entry.uuid,
        canRewind: snapshotFor.has(entry.uuid),
        text: promptTextOf(entry),
      };
    }
    return null;
  } catch {
    // Nothing here is worth failing a turn over. The actions stay hidden until
    // the session is reopened, which is where they were before this existed.
    return null;
  }
}
