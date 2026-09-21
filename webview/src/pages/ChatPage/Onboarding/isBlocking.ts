import { StepStatus, type ChecklistStep } from './types';

/**
 * Whether the checklist should take the empty state over and turn the composer
 * off.
 *
 * The bar is deliberately high, because raising the card is not just showing a
 * notice: it replaces the empty state and disables the input. Getting this wrong
 * in the permissive direction locks a working install out of its own chat.
 *
 * So only a step we KNOW is unsatisfied counts:
 *
 * - `CHECKING` does not count. Every launch starts there, and counting it would
 *   flash the card and dim the composer for a moment on every single start.
 * - `UNKNOWN` does not count. It means we asked and got nothing back — a CLI
 *   that timed out, output we could not parse. Blocking on that is the app
 *   punishing the user for its own failed lookup, and it is exactly the shape of
 *   #178, where a slow `auth status` was read as a logout and people were told
 *   to sign in while already signed in.
 * - An optional step never counts. The dock being unarranged is not a reason to
 *   stop someone typing.
 */
export function isBlocking(steps: ChecklistStep[]): boolean {
  return steps.some((step) => !step.optional && step.status === StepStatus.TODO);
}
