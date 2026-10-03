/**
 * The text Ctrl+K cut and Ctrl+Y puts back (issue #506), the counterpart of the
 * kill buffer macOS keeps for its native text fields.
 *
 * Like the macOS one it holds a single entry and is separate from the system
 * clipboard, so Ctrl+K never overwrites what Cmd+C copied. It lives for the
 * page's lifetime and is shared by every field in it, so text killed in one
 * field can be yanked into another.
 *
 * Consecutive kills append. Pressing Ctrl+K three times at the start of a line
 * takes the line, then its line break, then the next line, and Ctrl+Y gives all
 * of it back, as in macOS and Emacs. A kill continues the previous one only
 * when nothing happened in between, which is decided without watching every
 * event: the previous kill remembers the field, the caret offset and the full
 * text it left behind, and the next kill continues it only if all three are
 * still exactly that. Any typing, click elsewhere or edit changes one of them.
 * The one blind spot is an action that leaves all three as they were (moving
 * away and back with the mouse); for the Emacs keys themselves the caller
 * closes that gap by calling {@link KillRing.breakSequence} on every key other
 * than Ctrl+K.
 */
export class KillRing {
  private entry = '';

  /** Where the last kill left things, or null when the next kill starts fresh. */
  private lastKill: { owner: object; caret: number; textAfter: string } | null = null;

  /** The text Ctrl+Y inserts; empty before the first kill. */
  text(): string {
    return this.entry;
  }

  /**
   * Record one kill.
   *
   * @param owner The field the text was killed from.
   * @param killed The text removed.
   * @param caret The offset the kill started at, which is where the caret rests after it.
   * @param textBefore The field's whole text before the kill.
   * @param textAfter The field's whole text after it.
   */
  recordKill(owner: object, killed: string, caret: number, textBefore: string, textAfter: string): void {
    const last = this.lastKill;
    const continues = last !== null
      && last.owner === owner
      && last.caret === caret
      && last.textAfter === textBefore;
    this.entry = continues ? this.entry + killed : killed;
    this.lastKill = { owner, caret, textAfter };
  }

  /** Make the next kill start a new entry instead of appending to this one. */
  breakSequence(): void {
    this.lastKill = null;
  }

  /** Forget everything, for tests. */
  clear(): void {
    this.entry = '';
    this.lastKill = null;
  }
}

/** The one kill ring the page shares, as macOS shares one across its text fields. */
export const killRing = new KillRing();
