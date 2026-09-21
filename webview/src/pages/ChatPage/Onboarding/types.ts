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
 * The four steps do not divide evenly, and the button has to say which kind it
 * is before it is pressed. Two of them we can carry out in place; one we can
 * only navigate to; one belongs to a terminal we do not own.
 */
export enum StepAction {
  /** We perform it here — installing the kit. The button reads "Install". */
  PERFORM = 'perform',
  /** We open the screen where it is done. The button reads "Show me". */
  REVEAL = 'reveal',
  /** The user does it outside the app. No button; the row explains instead. */
  MANUAL = 'manual',
}

export interface ChecklistStep {
  /** Stable key. Also the i18n key suffix and the dismissal record's id. */
  id: string;
  status: StepStatus;
  action: StepAction;
  /** Marked optional in the list, and never the one step shown as "next". */
  optional?: boolean;
  /** Runs when the button is pressed. Absent for {@link StepAction.MANUAL}. */
  run?: () => void | Promise<void>;
  /** True while {@link run} is in flight, so the row can say so. */
  running?: boolean;
}
