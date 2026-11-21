import { watch, type FSWatcher } from 'fs';
import type { ConnectionManager } from '../../ws/connection-manager';
import { MessageType } from '../../shared';
import { loadBackgroundTaskOutput } from './loadBackgroundTaskOutput';
import { peekWorkflowTracker } from './workflow-tracker';

const DEBOUNCE_MS = 200;
// How often to retry starting the fs.watch while the output file doesn't
// exist yet (a task's tool_result — which is what makes the webview call
// watchBackgroundTaskOutput at all — can land before the CLI has actually
// created the file on disk).
const RETRY_MS = 500;

interface Watcher {
  /** How many pages of an agent's record this subscriber has asked for; each push covers them all (see conversationWindow.ts). */
  pages: number;
  fsWatcher?: FSWatcher;
  /**
   * Set once a watch has started. A watch that starts again (the file was missing at first, or was replaced) sends what
   * is on disk then, since changes made before it started were not reported to it. The very first watch does not: the
   * push made as the subscription began covers it.
   */
  pushOnStart?: boolean;
  debounceTimer?: ReturnType<typeof setTimeout>;
  retryTimer?: ReturnType<typeof setTimeout>;
}

// Keyed by `${connectionId}::${outputFile}` so the same file can be watched
// independently by multiple webview connections (e.g. two IDE windows), and
// re-watching from the same connection is a no-op rather than a duplicate watch.
const watchers = new Map<string, Watcher>();

function key(connectionId: string, outputFile: string): string {
  return `${connectionId}::${outputFile}`;
}

async function pushOutput(connectionId: string, outputFile: string, connections: ConnectionManager): Promise<void> {
  const pages = watchers.get(key(connectionId, outputFile))?.pages ?? 1;
  // The CLI closes the log with `[exited with code N]` / `[killed]`, and for a
  // task whose owning CLI died that line is the only notice we ever get that it
  // is over. This file changing is the moment that line appears, so it is also
  // the moment to stop the panel claiming the task is still running.
  peekWorkflowTracker()?.settleByOutputFile(outputFile);

  const result = await loadBackgroundTaskOutput({ outputFile, pages });
  connections.sendTo(connectionId, MessageType.BACKGROUND_TASK_OUTPUT_CHANGED, {
    outputFile,
    text: result.text,
    truncated: result.truncated,
    startIndex: result.startIndex,
  });
}

/**
 * Push a background Bash task's output log to one connection every time the
 * file changes on disk, instead of the webview polling for it (issue #347
 * follow-up — the CLI has no event for "a task's log grew a line", so this
 * backend-side `fs.watch` is what makes the modal genuinely live instead of
 * re-fetching on a timer). Safe to call again for the same connection+file —
 * re-watching is a no-op, not a duplicate watcher piling up.
 */
export function watchBackgroundTaskOutput(
  connectionId: string,
  outputFile: string,
  connections: ConnectionManager,
): void {
  const k = key(connectionId, outputFile);
  if (watchers.has(k)) return;

  const entry: Watcher = { pages: 1 };
  watchers.set(k, entry);

  // Send the current content immediately so the caller doesn't have to wait
  // for the first change to see anything (mirrors an initial GET before
  // subscribing to updates). A no-op (empty text) if the file doesn't exist
  // yet — loadBackgroundTaskOutput already treats a missing file as empty.
  void pushOutput(connectionId, outputFile, connections);

  tryStartWatching(connectionId, outputFile, connections, k, entry);
}

function tryStartWatching(
  connectionId: string,
  outputFile: string,
  connections: ConnectionManager,
  k: string,
  entry: Watcher,
): void {
  try {
    entry.fsWatcher = watch(outputFile, (event) => {
      const w = watchers.get(k);
      if (!w) return;
      // At most one push per DEBOUNCE_MS, and the last change is always followed by one. The timer is NOT reset by each
      // change: a log that grows faster than DEBOUNCE_MS (a build, a test run) would otherwise never get a push until
      // it paused, and the pane would sit on what it showed at the start.
      if (!w.debounceTimer) {
        w.debounceTimer = setTimeout(() => {
          w.debounceTimer = undefined;
          void pushOutput(connectionId, outputFile, connections);
        }, DEBOUNCE_MS);
      }
      // The file was replaced or removed under the watch (a `rename`): the watch holds the old file and will see
      // nothing more of the new one, so it is started again on the path.
      if (event === 'rename') restartWatching(connectionId, outputFile, connections, k, entry);
    });
    entry.fsWatcher.on('error', () => restartWatching(connectionId, outputFile, connections, k, entry));
    // The file may have been written between the push that was made when the subscription began (or the last one) and
    // the moment this watch started: a change before the watch is not reported, so what is on disk now is sent once.
    if (entry.pushOnStart) void pushOutput(connectionId, outputFile, connections);
    entry.pushOnStart = true;
  } catch {
    // Whatever is written while there is no watch is not reported when one starts, so that start sends the file.
    entry.pushOnStart = true;
    // File doesn't exist yet (task just started, tool_result raced ahead of
    // the CLI actually creating the file) — nothing to watch yet. Keep
    // retrying until it appears (or unwatch tears this down); a task that
    // finishes fast enough is still caught by one of these retries before
    // completion, since loadBackgroundTaskOutput reads whatever is on disk
    // at that moment.
    entry.retryTimer = setTimeout(() => {
      if (!watchers.has(k)) return; // unwatched while we were waiting
      tryStartWatching(connectionId, outputFile, connections, k, entry);
    }, RETRY_MS);
  }
}

/** Close the watch on the file and start one again, keeping the subscription. Not while the subscription is gone. */
function restartWatching(
  connectionId: string,
  outputFile: string,
  connections: ConnectionManager,
  k: string,
  entry: Watcher,
): void {
  entry.fsWatcher?.close();
  entry.fsWatcher = undefined;
  if (entry.retryTimer) clearTimeout(entry.retryTimer);
  // A short wait, so a file that is being replaced is there when the watch is asked for again; the retry covers one that
  // is still missing then.
  entry.retryTimer = setTimeout(() => {
    if (!watchers.has(k)) return; // unwatched while we were waiting
    tryStartWatching(connectionId, outputFile, connections, k, entry);
  }, 50);
}

/**
 * Send one more page of an agent's record to a subscriber, ahead of what it holds: the page count goes up by one and
 * the whole window is pushed again, so the subscriber never has to splice pages together. A no-op for a file this
 * connection is not watching.
 */
export function loadEarlierBackgroundTaskOutput(
  connectionId: string,
  outputFile: string,
  connections: ConnectionManager,
): void {
  const w = watchers.get(key(connectionId, outputFile));
  if (!w) return;
  w.pages += 1;
  void pushOutput(connectionId, outputFile, connections);
}

/** Stop watching one connection's subscription to a task's output log. */
export function unwatchBackgroundTaskOutput(connectionId: string, outputFile: string): void {
  const k = key(connectionId, outputFile);
  const w = watchers.get(k);
  if (!w) return;
  if (w.debounceTimer) clearTimeout(w.debounceTimer);
  if (w.retryTimer) clearTimeout(w.retryTimer);
  w.fsWatcher?.close();
  watchers.delete(k);
}

/** Stop every watcher a connection holds — called when the connection drops. */
export function unwatchAllForConnection(connectionId: string): void {
  const prefix = `${connectionId}::`;
  for (const k of watchers.keys()) {
    if (!k.startsWith(prefix)) continue;
    const w = watchers.get(k)!;
    if (w.debounceTimer) clearTimeout(w.debounceTimer);
    if (w.retryTimer) clearTimeout(w.retryTimer);
    w.fsWatcher?.close();
    watchers.delete(k);
  }
}
