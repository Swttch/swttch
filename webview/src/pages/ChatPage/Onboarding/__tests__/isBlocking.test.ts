import { describe, it, expect } from 'vitest';
import { isBlocking } from '../isBlocking';
import { StepAction, StepStatus, type ChecklistStep } from '../types';

const step = (
  id: string,
  status: StepStatus,
  optional = false,
): ChecklistStep => ({ id, status, action: StepAction.REVEAL, optional });

/**
 * What this rule decides is whether the chat can be typed into.
 *
 * Raising the checklist is not a notice — it stands in for the empty state and
 * puts the composer behind `pointer-events-none`. So the question these cases
 * pin down is not "is setup finished" but "are we SURE it is not", and the
 * answer has to be no for anything short of a confirmed missing prerequisite.
 */
describe('isBlocking', () => {
  it('blocks when a required step is confirmed missing', () => {
    expect(
      isBlocking([
        step('installCli', StepStatus.DONE),
        step('signIn', StepStatus.TODO),
      ]),
    ).toBe(true);
  });

  it('lets a fully set up machine through', () => {
    expect(
      isBlocking([
        step('installCli', StepStatus.DONE),
        step('signIn', StepStatus.DONE),
        step('installKit', StepStatus.DONE),
        step('arrangeDock', StepStatus.DONE, true),
      ]),
    ).toBe(false);
  });

  it('does not block while the answers are still being fetched', () => {
    // Every launch passes through this state. Blocking here would dim the
    // composer for a moment on every single start.
    expect(
      isBlocking([
        step('installCli', StepStatus.CHECKING),
        step('signIn', StepStatus.CHECKING),
        step('installKit', StepStatus.CHECKING),
      ]),
    ).toBe(false);
  });

  it('does not block on a step we asked about and got no answer for', () => {
    // This is #178's shape: a slow `claude auth status` read as a logout. An
    // unanswered check is our failure, and the user is not made to pay for it.
    expect(
      isBlocking([
        step('installCli', StepStatus.DONE),
        step('signIn', StepStatus.UNKNOWN),
        step('installKit', StepStatus.DONE),
      ]),
    ).toBe(false);
  });

  it('does not block on an optional step alone', () => {
    // An existing user who never arranged the dock has a working install. If
    // this returned true their composer would be disabled on every launch.
    expect(
      isBlocking([
        step('installCli', StepStatus.DONE),
        step('signIn', StepStatus.DONE),
        step('installKit', StepStatus.DONE),
        step('arrangeDock', StepStatus.TODO, true),
      ]),
    ).toBe(false);
  });

  it('still blocks when a required step is missing alongside an unanswered one', () => {
    // Uncertainty elsewhere does not excuse a prerequisite we know is absent.
    expect(
      isBlocking([
        step('installCli', StepStatus.TODO),
        step('signIn', StepStatus.UNKNOWN),
      ]),
    ).toBe(true);
  });

  it('does not block on an empty list', () => {
    expect(isBlocking([])).toBe(false);
  });
});
