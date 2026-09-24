import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { StepStatus, type ChecklistStep } from '@/pages/ChatPage/Onboarding/types';

/** What the hook reports for the render under test. */
let checklist: {
  steps: ChecklistStep[];
  dismissedAt: string | null | undefined;
  allDone: boolean;
  dismiss: () => void;
};

/**
 * The hook's own module rather than the barrel it is re-exported from: mocking
 * the barrel would have to reproduce everything else it exports, and the barrel
 * picks this mock up anyway.
 */
vi.mock('@/pages/ChatPage/Onboarding/useOnboardingChecklist', () => ({
  useOnboardingChecklist: () => checklist,
}));

/** What the conversation holds for the render under test. */
let messages: unknown[] = [];

vi.mock('../ChatStreamContext', () => ({
  useChatStreamContext: () => ({ messages }),
}));

import { OnboardingProvider, useOnboarding } from '../OnboardingContext';

let visible: boolean | null = null;
function Probe() {
  visible = useOnboarding().visible;
  return null;
}

const renderProvider = () =>
  render(
    <OnboardingProvider>
      <Probe />
    </OnboardingProvider>,
  );

const step = (id: string, status: StepStatus): ChecklistStep => ({ id, status, actions: [] });

beforeEach(() => {
  visible = null;
  messages = [];
  checklist = {
    steps: [step('installCli', StepStatus.DONE)],
    dismissedAt: null,
    allDone: true,
    dismiss: vi.fn(),
  };
});

/**
 * One fact decides whether the card is raised: whether it has ever been closed.
 *
 * The card is a once-per-install thing, so a record of it having been closed is
 * the end of the matter. How far the steps got is not part of the decision and
 * must never become part of it — that was #482, where an install that had been
 * chatting for weeks was re-judged on every launch and lost its message box to
 * one lookup coming back wrong.
 */
describe('OnboardingProvider', () => {
  it('raises the card when the card has never been closed', () => {
    checklist.dismissedAt = null;

    renderProvider();

    expect(visible).toBe(true);
  });

  it('never raises the card again once it has been closed', () => {
    checklist.dismissedAt = '2026-01-01T00:00:00.000Z';

    renderProvider();

    expect(visible).toBe(false);
  });

  it('stays down for a closed card even with every step unfinished', () => {
    // The whole point of the record. A machine that is genuinely not set up is
    // still not asked twice, and is still left able to type.
    checklist.dismissedAt = '2026-01-01T00:00:00.000Z';
    checklist.steps = [step('installCli', StepStatus.TODO), step('signIn', StepStatus.TODO)];
    checklist.allDone = false;

    renderProvider();

    expect(visible).toBe(false);
  });

  it('raises the card on an unclosed record whatever the steps say', () => {
    // The mirror of the case above: a first run is a first run, and the card is
    // what a first run opens on even if the machine happens to be in order.
    checklist.dismissedAt = null;
    checklist.allDone = true;

    renderProvider();

    expect(visible).toBe(true);
  });

  it('stays down on a screen the card cannot appear on', () => {
    // #482 itself. The card stands in the empty state, so a conversation with
    // history leaves it nowhere to go. Reported "up" here, the message box would
    // go dead with nothing on screen to explain it or to close — which is what
    // the reporter met after opening a project they had been chatting in.
    checklist.dismissedAt = null;
    messages = [{ uuid: 'one' }];

    renderProvider();

    expect(visible).toBe(false);
  });

  it('holds the card back until the record has actually been read', () => {
    // Undefined is "not answered yet", not "never closed". Treated as the
    // latter, the card would flash at every install that closed it long ago,
    // once per launch.
    checklist.dismissedAt = undefined;

    renderProvider();

    expect(visible).toBe(false);
  });
});
