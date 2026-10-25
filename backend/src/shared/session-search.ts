/**
 * One entry of a session that contains the text being searched for, as the
 * find bar's backend search reports it.
 *
 * Only a coordinate and a count, never the entry: the entry is reachable in full
 * by loading the transcript back to it (`includeUuid`), which is the path that
 * keeps the original-data rule. A hit is "this entry, this many times", and the
 * webview works out where inside the entry each one is from the text it draws,
 * because the characters on screen are not the characters in the file (markdown
 * is rendered, system reminders are cut out, tool results are merged into their
 * cards) and an offset into one would point at nothing in the other.
 */
export interface SessionSearchHit {
  /** `uuid` of the JSONL entry. Also how a jump finds it in the transcript. */
  uuid: string;
  /** How many times the text occurs in what that entry shows. At least 1. */
  count: number;
}
