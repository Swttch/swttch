/**
 * Counts the Escape presses that come AFTER the foreground turn has stopped.
 *
 * One Escape interrupts the turn (issue #330); background tasks keep running,
 * as they do in the CLI. Three more Escapes on an already-idle chat are the
 * gesture for "stop the background ones too", which then asks for confirmation.
 *
 * Presses made while the turn is still streaming never count: the first one is
 * the interrupt, so a four-tap run reads as interrupt + three. That is why the
 * counter is fed `interruptible` rather than reading a key event alone — the
 * same key means two different things either side of the interrupt.
 *
 * Kept as a plain class, like {@link PressToTalk}: it holds no React state and
 * the keyboard path needs it inside an effect where hooks cannot go.
 */

/** Escapes on an idle chat needed to ask about stopping background tasks. */
export const BACKGROUND_STOP_STREAK = 3;

/**
 * How long a streak stays alive between presses. Long enough not to punish a
 * deliberate, unhurried triple-tap; short enough that three unrelated Escapes
 * minutes apart never add up to one.
 */
export const STREAK_WINDOW_MS = 1500;

export class EscapeStreak {
  private count = 0;
  private lastAt = 0;

  /**
   * Register one Escape press.
   *
   * @param interruptible Whether the chat is mid-turn — i.e. this press is the
   *   interrupt, not part of a streak.
   * @returns true when this press completes the streak, meaning the caller
   *   should ask about stopping background tasks. Resets on true, so holding
   *   Escape down does not fire it repeatedly.
   */
  press(interruptible: boolean, now: number = Date.now()): boolean {
    // The interrupt itself is not part of the streak, and it restarts the count
    // so the presses that follow it are counted from zero.
    if (interruptible) {
      this.count = 0;
      this.lastAt = now;
      return false;
    }

    this.count = now - this.lastAt <= STREAK_WINDOW_MS ? this.count + 1 : 1;
    this.lastAt = now;

    if (this.count < BACKGROUND_STOP_STREAK) return false;
    this.count = 0;
    return true;
  }

  /** Forget any streak in progress (e.g. the confirmation is already open). */
  reset(): void {
    this.count = 0;
    this.lastAt = 0;
  }
}
