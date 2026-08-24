import { watch, type FSWatcher } from 'fs';
import type { ConnectionManager } from '../../ws/connection-manager';
import { MessageType } from '../../shared';
import { loadBackgroundTaskOutput } from './loadBackgroundTaskOutput';

const DEBOUNCE_MS = 200;
// How often to retry starting the fs.watch while the output file doesn't
// exist yet (a task's tool_result — which is what makes the webview call
// watchBackgroundTaskOutput at all — can land before the CLI has actually
// created the file on disk).
const RETRY_MS = 500;

interface Watcher {
  fsWatcher?: FSWatcher;
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
  const result = await loadBackgroundTaskOutput({ outputFile });
  connections.sendTo(connectionId, MessageType.BACKGROUND_TASK_OUTPUT_CHANGED, {
    outputFile,
    text: result.text,
    truncated: result.truncated,
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

  const entry: Watcher = {};
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
    entry.fsWatcher = watch(outputFile, () => {
      const w = watchers.get(k);
      if (!w) return;
      if (w.debounceTimer) clearTimeout(w.debounceTimer);
      w.debounceTimer = setTimeout(() => {
        void pushOutput(connectionId, outputFile, connections);
      }, DEBOUNCE_MS);
    });
    entry.fsWatcher.on('error', () => unwatchBackgroundTaskOutput(connectionId, outputFile));
  } catch {
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
