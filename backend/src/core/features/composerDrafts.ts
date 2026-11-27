import { mkdir, readdir, readFile, rm, writeFile, rename } from 'fs/promises';
import { join } from 'path';
import { ccgHomeDir } from '../../config/ccg-home';
import { ComposerDraft as ComposerDraftRow } from '../entities/composer/ComposerDraft.entity';
import { ComposerDraftCollection } from '../entities/composer/ComposerDraft.collection';
import { ProjectCollection } from '../entities/project/Project.collection';
import { blobIdsOf, isEmptyDraft, type ComposerDraft } from '../../shared';

/**
 * The composer drafts of sessions (#735): the row of `composer_drafts` holds the draft, and each picture it names is a
 * file under `composer-drafts/<sessionId>/`, so that saving a few typed words never rewrites the pictures.
 */

/** A session id and a picture id become file names, so only what the CLI and the webview mint is taken. */
const SAFE_NAME = /^[A-Za-z0-9_-]{1,128}$/;

function assertSafe(name: string): void {
  if (!SAFE_NAME.test(name)) throw new Error(`not a draft name: ${name}`);
}

const blobDir = (sessionId: string) => join(ccgHomeDir(), 'composer-drafts', sessionId);

/** What a session's draft is, and when it was received. A session with nothing written has `draft` null. */
export interface StoredDraft {
  draft: ComposerDraft | null;
  editedAt: number;
}

// Two saves of one session must not interleave: one deletes the pictures the other has just written.
const queue = new Map<string, Promise<unknown>>();
function inTurn<T>(sessionId: string, work: () => Promise<T>): Promise<T> {
  const next = (queue.get(sessionId) ?? Promise.resolve()).catch(() => undefined).then(work);
  queue.set(sessionId, next);
  void next.catch(() => undefined).finally(() => {
    if (queue.get(sessionId) === next) queue.delete(sessionId);
  });
  return next;
}

async function read(sessionId: string): Promise<StoredDraft> {
  const row = await new ComposerDraftCollection().ofSession(sessionId);
  if (!row) return { draft: null, editedAt: 0 };
  return { draft: JSON.parse(row.body) as ComposerDraft, editedAt: row.editedAt };
}

/** The draft of a session with the bytes of its pictures, leaving out the pictures the asker holds. */
export function loadComposerDraft(
  sessionId: string,
  have: readonly string[] = [],
): Promise<StoredDraft & { blobs: Record<string, string> }> {
  assertSafe(sessionId);
  return inTurn(sessionId, async () => {
    const stored = await read(sessionId);
    const blobs: Record<string, string> = {};
    for (const id of stored.draft ? blobIdsOf(stored.draft) : []) {
      if (have.includes(id) || !SAFE_NAME.test(id)) continue;
      try {
        blobs[id] = await readFile(join(blobDir(sessionId), id), 'utf-8');
      } catch {
        // A picture that is gone leaves its chip without one; the rest of the draft is still the user's.
      }
    }
    return { ...stored, blobs };
  });
}

/**
 * Keep the draft of a session, in place of the one it had, and answer with the time it was received. The time is the
 * backend's, so windows on machines whose clocks differ cannot disagree about which draft is the later one. An empty
 * draft removes the row.
 */
export function saveComposerDraft(
  workingDir: string,
  sessionId: string,
  draft: ComposerDraft,
  blobs: Record<string, string> = {},
): Promise<{ editedAt: number }> {
  assertSafe(sessionId);
  return inTurn(sessionId, async () => {
    const previous = await read(sessionId);
    const editedAt = Math.max(Date.now(), previous.editedAt + 1);
    const rows = new ComposerDraftCollection();
    const dir = blobDir(sessionId);

    if (isEmptyDraft(draft)) {
      await rows.deleteOfSession(sessionId);
      await rm(dir, { recursive: true, force: true });
      return { editedAt };
    }

    const wanted = new Set(blobIdsOf(draft));
    const given = Object.entries(blobs).filter(([id]) => wanted.has(id) && SAFE_NAME.test(id));
    if (given.length > 0) await mkdir(dir, { recursive: true, mode: 0o700 });
    for (const [id, data] of given) {
      const temporary = join(dir, `${id}.tmp`);
      await writeFile(temporary, data, { encoding: 'utf-8', mode: 0o600 });
      await rename(temporary, join(dir, id));
    }

    const projectId = await new ProjectCollection().idOf(workingDir);
    await rows.put(ComposerDraftRow.draft(projectId, sessionId, editedAt, JSON.stringify(draft)));

    // Pictures the draft names no longer.
    const files = await readdir(dir).catch(() => [] as string[]);
    await Promise.all(files.filter((name) => !wanted.has(name)).map((name) => rm(join(dir, name), { force: true })));

    return { editedAt };
  });
}
