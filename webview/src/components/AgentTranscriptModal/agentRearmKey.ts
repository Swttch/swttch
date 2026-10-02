/**
 * The `rearmKey` for an agent's transcript (see useAutoScroll).
 *
 * Two things say the user has just sent something here, and either one has to
 * switch following back on:
 *  - the send itself, counted by the modal the moment the composer sends. This
 *    is what the main chat gets for free, where a send is put on screen at
 *    once; an agent's transcript only shows the message after the CLI has
 *    resumed the agent and written it down.
 *  - the newest message the user sent changing in the transcript, which is the
 *    same signal the main chat watches (`findNewestUserUuid`).
 *
 * Null until there is either, so nothing is re-armed for a transcript the user
 * has not sent anything to.
 */
export function agentRearmKey(newestUserUuid: string | null, sendCount: number): string | null {
  if (!newestUserUuid && sendCount === 0) return null;
  return `${newestUserUuid ?? ''}#${sendCount}`;
}
