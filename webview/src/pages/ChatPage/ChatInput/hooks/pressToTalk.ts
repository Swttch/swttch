/**
 * Tap-or-hold, shared by the microphone button and the keyboard shortcut.
 *
 * The user never picks a mode. A quick press turns recording on and leaves it
 * on; pressing and holding records only while held. Which one happened is
 * decided by how long the press lasted, so someone who does not know the
 * feature exists gets sensible behaviour either way.
 *
 * The rule lives here rather than in each control because the two are the same
 * action reached two ways — a shortcut that behaved differently from the button
 * would be the same feature answering to two rules.
 */

/** Below this, a press counts as a tap (toggle) rather than a hold. */
export const HOLD_THRESHOLD_MS = 300;

/** What a press or release should do to the recording. */
export enum PressAction {
  /** Begin recording. */
  Start = 'start',
  /** End recording. */
  Stop = 'stop',
  /** Leave it as it is — a tap's release, or a repeat while held. */
  None = 'none',
}

/**
 * Tracks one press at a time, turning down/up events into start/stop.
 *
 * Deliberately a plain object rather than a hook: it holds no React state, and
 * the keyboard path needs it inside an effect where hooks cannot go.
 */
export class PressToTalk {
  private pressedAt = 0;
  private startedByThisPress = false;
  /** True between down and up, so key repeats can be ignored. */
  private down = false;

  /**
   * @param isRecording Whether recording is on right now.
   * @param now Injectable clock, so tests do not depend on wall time.
   */
  press(isRecording: boolean, now: number = Date.now()): PressAction {
    // A key held down repeats; only the first event is a press.
    if (this.down) return PressAction.None;
    this.down = true;
    this.pressedAt = now;

    if (isRecording) {
      // Already recording, from an earlier tap. The stop happens on release,
      // not here: stopping on the way down would end the recording and then
      // leave a key still held, which the next release would have to explain
      // away. Waiting for the release keeps one press meaning one thing.
      this.startedByThisPress = false;
      return PressAction.None;
    }
    this.startedByThisPress = true;
    return PressAction.Start;
  }

  release(now: number = Date.now()): PressAction {
    if (!this.down) return PressAction.None;
    this.down = false;

    // This press began while already recording — it is the stop half of a tap.
    if (!this.startedByThisPress) return PressAction.Stop;

    // Started by this press: a hold ends on release, a tap keeps running.
    return now - this.pressedAt >= HOLD_THRESHOLD_MS ? PressAction.Stop : PressAction.None;
  }

  /** Forget an in-flight press, e.g. when the window loses focus mid-hold. */
  cancel(): void {
    this.down = false;
    this.startedByThisPress = false;
  }
}
