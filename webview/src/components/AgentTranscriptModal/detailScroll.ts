/**
 * The detail views remember no reading position: every opening starts at the
 * newest content.
 *
 * A remembered position goes stale here in a way it does not in the main
 * chat. Following the bottom fires scroll events too, so what got written down
 * was "the bottom as of then", and by the next opening a running task has added
 * more below it: the view came back part-way up, not following. Each agent and
 * output file would also have left a key behind that nothing ever clears, and in
 * the JetBrains host the storage starts empty on every launch anyway.
 */
export const DETAIL_STORAGE_KEY = null;
