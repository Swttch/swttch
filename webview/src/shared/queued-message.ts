/**
 * One message waiting in a session's backend-owned queue — the "queue"
 * composer follow-up-behavior setting (`FollowUpBehavior.Queue`, see
 * `composer-shortcut.ts`), not the CLI's own mid-turn stdin buffer that
 * `queued-prompts.ts` reconstructs after the fact.
 *
 * Wire shape only, deliberately smaller than the backend's own queue entry
 * (`backend/src/core/features/messageQueue.ts`): no attachment payload, so a
 * queued image does not travel to every subscriber before anyone needs it.
 * Attachments still ride along once the message is actually released to the
 * CLI (see `QUEUED_MESSAGES_CHANGED` in `message-type.ts`).
 */
export interface QueuedMessage {
  /** Unique within the session's queue; what a cancel names. */
  id: string;
  content: string;
  /** `Date.now()` at the moment it was queued, for the order they are shown in. */
  queuedAt: number;
}
