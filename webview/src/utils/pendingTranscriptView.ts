import { useSyncExternalStore } from 'react';
import type { TranscriptViewMode } from '@/types/settings';

/** A view the chat can be drawn in: one of the three Transcript views, or the classic chat. */
export type TranscriptViewChoice = TranscriptViewMode | 'classic';

/**
 * The view picked in a chat that has not started its session yet.
 *
 * A view is kept per session id, and a chat that has sent nothing has no id to keep it under. So the pick waits
 * here, in this page only (nothing is written), until the first message gives the session an id: that message
 * starts the session in this view, and the view is then saved under the new id (see
 * {@link takePendingTranscriptView}). A page that is closed or reloaded before sending forgets it.
 */
let pending: TranscriptViewChoice | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function getPendingTranscriptView(): TranscriptViewChoice | null {
  return pending;
}

export function setPendingTranscriptView(choice: TranscriptViewChoice | null): void {
  if (pending === choice) return;
  pending = choice;
  emit();
}

/** The waiting pick, which is then no longer waiting. Null when none was picked. */
export function takePendingTranscriptView(): TranscriptViewChoice | null {
  const taken = pending;
  setPendingTranscriptView(null);
  return taken;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** For tests: listen to the pick without a component. */
export const subscribePendingTranscriptViewForTest = subscribe;

/** The waiting pick, re-read whenever it changes. */
export function usePendingTranscriptView(): TranscriptViewChoice | null {
  return useSyncExternalStore(subscribe, getPendingTranscriptView, getPendingTranscriptView);
}
