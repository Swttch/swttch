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
 * Which of the fixed set of buttons this is.
 *
 * The kind picks the label, so a button that does the same thing on two rows
 * reads the same on both. Rows do not get to name their own buttons: the moment
 * one says "Check" and another says "Re-check" for the same act, the list stops
 * being scannable.
 */
export enum ActionKind {
  /** Finishes the step here — installing the kit. Reads "Install". */
  PERFORM = 'perform',
  /** Asks the question again. Reads "Re-check". */
  RECHECK = 'recheck',
  /** Opens the login page, remembering where to return to. Reads "Sign in". */
  LOGIN = 'login',
  /** Opens the screen where the step is done. Reads "Show". */
  REVEAL = 'reveal',
}

export interface StepAction {
  kind: ActionKind;
  run: () => void | Promise<void>;
  /** True while {@link run} is in flight, so the button can say so. */
  running?: boolean;
}

export interface ChecklistStep {
  /** Stable key. Also the i18n key suffix for the step's label. */
  id: string;
  status: StepStatus;
  /**
   * Buttons for this step, drawn left to right in this order.
   *
   * A list rather than one button because a step can be both acted on and
   * asked about again: signing in offers the page AND a way to say "I did it
   * elsewhere, look again", and those are different acts that must not share
   * one control.
   */
  actions: StepAction[];
  /** Marked optional in the list, and never the one step shown as "next". */
  optional?: boolean;
}
