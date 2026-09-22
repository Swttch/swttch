/**
 * Whether a checklist step is satisfied.
 *
 * `UNKNOWN` is not a loading state and not a synonym for `TODO`. Asking the CLI
 * whether it is logged in can fail without answering — a timeout, a spawn error,
 * output we cannot parse — and that is NOT a logged-out account. Painting it as
 * TODO is what #178 ("reauthenticate repeatedly") was: the panel told people to
 * sign in while they already were, because a slow answer read as "no".
 *
 * So the third value exists to be drawn differently from both of the others.
 */
export enum StepStatus {
  DONE = 'done',
  TODO = 'todo',
  UNKNOWN = 'unknown',
  /**
   * The question is still out. Distinct from {@link UNKNOWN}, which is what we
   * are left with after it comes back unanswered: this one resolves on its own,
   * that one does not. Drawing them the same would tell someone to wait when
   * there is nothing more coming, or to act when the answer is a moment away.
   */
  CHECKING = 'checking',
}

/**
 * What pressing the step's button actually does.
 *
 * The button has to say which of the two it is before it is pressed. One of
 * them finishes the step where you stand; the rest open the screen where the
 * step is done and leave the doing to you. A single label over both would mean
 * you could not tell, without pressing, whether you were about to finish
 * something or merely arrive somewhere.
 */
export enum StepAction {
  /** We perform it here — installing the kit. The button reads "Install". */
  PERFORM = 'perform',
  /** We open the screen where it is done. The button reads "Show me". */
  REVEAL = 'reveal',
}

export interface ChecklistStep {
  /** Stable key. Also the i18n key suffix and the dismissal record's id. */
  id: string;
  status: StepStatus;
  action: StepAction;
  /** Marked optional in the list, and never the one step shown as "next". */
  optional?: boolean;
  /** Runs when the button is pressed. */
  run: () => void | Promise<void>;
  /** True while {@link run} is in flight, so the row can say so. */
  running?: boolean;
}
