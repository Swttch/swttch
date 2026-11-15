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
 * Reads are told apart by [key]; reads of different keys never wait on each other.
 */

interface Slot {
  /** The read that is running. */
  running: Promise<unknown>;
  /** The read that starts when [running] ends, shared by every request that came while it ran. */
  queued: Promise<unknown> | null;
}

const slots = new Map<string, Slot>();

function start<T>(key: string, read: () => Promise<T>): Promise<T> {
  let running: Promise<T>;
  try {
    running = read();
  } catch (err) {
    running = Promise.reject(err);
  }
  const slot: Slot = { running, queued: null };
  slots.set(key, slot);
  const finished = () => {
    // Left in place when a read is waiting behind it: that read replaces it when it starts.
    if (slots.get(key) === slot && slot.queued === null) slots.delete(key);
  };
  running.then(finished, finished);
  return running;
}

const ignore = () => undefined;

export function coalesceReads<T>(key: string, read: () => Promise<T>): Promise<T> {
  const slot = slots.get(key);
  if (!slot) return start(key, read);
  if (slot.queued === null) {
    slot.queued = slot.running.then(ignore, ignore).then(() => start(key, read));
  }
  return slot.queued as Promise<T>;
}
