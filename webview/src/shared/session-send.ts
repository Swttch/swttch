/**
 * One row of the send index: enough to draw a tick and label it, without the
 * entry behind it.
 *
 * The send's own content is deliberately absent. A prompt carries whatever was
 * pasted into it, and measured over 197 sessions of this repo the newest 100
 * prompts serialise to 8KB at the median but 21MB at the worst. Shipping that
 * with a list whose whole job is to be available immediately would push all of
 * it through the socket before the user has looked at anything.
 *
 * This is an INDEX built alongside the transcript, not a trimmed-down copy of
 * it: the entries themselves still travel unedited over the normal session-load
 * path, so CLAUDE.md's original-data rule is satisfied — a range may be split,
 * an entry may not be edited. Anything the preview cuts off is reachable in
 * full by loading the transcript around that send.
 */
export interface SessionSend {
  /** `uuid` of the JSONL entry. Also how a jump finds the send in the transcript. */
  uuid: string;
  /** The entry's `timestamp`, or null when it carries none. */
  timestamp: string | null;
  /**
   * A short slice of what the user typed, for the index's preview card.
   *
   * Line breaks are kept: the card draws its first line differently from the
   * rest, and collapsing them would leave every multi-line send looking like
   * one long sentence.
   */
  preview: string;
}
