/**
 * Keep the reads of one thing to the one running and at most one more behind it.
 *
 * Every screen that shows a session list asks for it on its own, and a change to
 * a session makes ALL of them ask at the same moment. The backend is one process,
 * so N identical reads do not run side by side: they take N times as long, and the
 * last screen waits for all of them. Measured on this project, six screens asking
 * for one list at once took 10.8 seconds where one ask takes 2.5.
 *
 * A request that arrives while a read is running is answered by the NEXT read,
 * and every request that arrives meanwhile shares that one. It is not answered by
 * the running read: that read began before the request did and may have seen
 * what the request was sent to find out about (a session archived a moment ago).
 * The next read starts after the request arrived, so it cannot be old.
 *
 * [versionOf], when given, says whether anything that the answer depends on changed: a number that rises with each
 * change. A request that comes while a read runs shares that read, instead of waiting for the next one, when the
 * number is what it was when that read began, because the read then cannot have missed anything.
 *
 * Reads are told apart by [key]; reads of different keys never wait on each other.
 */

interface Slot {
  /** The read that is running. */
  running: Promise<unknown>;
  /** What [versionOf] said when [running] began, to tell whether anything it could have missed was said since. */
  version: number | undefined;
  /** The read that starts when [running] ends, shared by every request that came while it ran. */
  queued: Promise<unknown> | null;
}

const slots = new Map<string, Slot>();

function start<T>(key: string, read: () => Promise<T>, versionOf?: () => number): Promise<T> {
  let running: Promise<T>;
  try {
    running = read();
  } catch (err) {
    running = Promise.reject(err);
  }
  // Taken after the read was called, so what the read does as it begins is not counted as a change.
  const slot: Slot = { running, version: versionOf?.(), queued: null };
  slots.set(key, slot);
  const finished = () => {
    // Left in place when a read is waiting behind it: that read replaces it when it starts.
    if (slots.get(key) === slot && slot.queued === null) slots.delete(key);
  };
  running.then(finished, finished);
  return running;
}

const ignore = () => undefined;

export function coalesceReads<T>(key: string, read: () => Promise<T>, versionOf?: () => number): Promise<T> {
  const slot = slots.get(key);
  if (!slot) return start(key, read, versionOf);
  // A read that began before this request is still right for it when nothing it could have missed was said
  // since it began: the request shares that read instead of waiting for the one behind it.
  if (slot.queued === null && versionOf && slot.version !== undefined && slot.version === versionOf()) {
    return slot.running as Promise<T>;
  }
  if (slot.queued === null) {
    slot.queued = slot.running.then(ignore, ignore).then(() => start(key, read, versionOf));
  }
  return slot.queued as Promise<T>;
}
