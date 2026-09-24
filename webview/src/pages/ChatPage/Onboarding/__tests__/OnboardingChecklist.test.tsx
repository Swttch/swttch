import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

/**
 * Stands in for Tippy, recording what it was asked to show.
 *
 * The real one renders nothing until a hover, so asserting on the tooltip text
 * directly would be asserting on a hover rather than on the card. What matters
 * here is whether the card asked for a tooltip at all, which is the thing that
 * changes with the button's state.
 */
const tooltipContents: unknown[] = [];
vi.mock('@/components/Tooltip', () => ({
  Tooltip: ({ content, children }: { content?: React.ReactNode; children: React.ReactNode }) => {
    tooltipContents.push(content);
    return <>{children}</>;
  },
}));

import { OnboardingChecklist } from '../OnboardingChecklist';
import { StepStatus, type ChecklistStep } from '../types';

const step = (
  id: string,
  status: StepStatus,
  optional = false,
): ChecklistStep => ({ id, status, optional, actions: [] });

const getStartedButton = () => screen.getByRole('button', { name: 'onboarding.getStarted' });

/**
 * The card is raised once per install and closed by hand.
 *
 * Nothing here closes itself. Finishing the last step lights the "Get started"
 * button up rather than dismissing the card out from under the person reading
 * it, and until then the way past the checklist is the close button — which is
 * what the disabled button's tooltip says.
 */
describe('OnboardingChecklist', () => {
  beforeEach(() => {
    tooltipContents.length = 0;
  });

  it('offers a disabled "Get started" while any step is unfinished', () => {
    render(
      <OnboardingChecklist
        steps={[step('installCli', StepStatus.DONE), step('signIn', StepStatus.TODO)]}
        allDone={false}
        onDismiss={() => {}}
      />,
    );

    expect(getStartedButton()).toBeDisabled();
  });

  it('points at the close button while "Get started" cannot be pressed', () => {
    // A control that cannot be pressed and says nothing about why is a dead end.
    // The way past the checklist exists; the tooltip is where it is named.
    render(
      <OnboardingChecklist
        steps={[step('installCli', StepStatus.TODO)]}
        allDone={false}
        onDismiss={() => {}}
      />,
    );

    expect(tooltipContents).toContain('onboarding.getStartedHint');
  });

  it('enables "Get started" once every step is done', () => {
    render(
      <OnboardingChecklist
        steps={[step('installCli', StepStatus.DONE), step('signIn', StepStatus.DONE)]}
        allDone
        onDismiss={() => {}}
      />,
    );

    expect(getStartedButton()).toBeEnabled();
  });

  it('drops the hint once the button works, since there is nothing to explain', () => {
    render(
      <OnboardingChecklist
        steps={[step('installCli', StepStatus.DONE)]}
        allDone
        onDismiss={() => {}}
      />,
    );

    expect(tooltipContents).not.toContain('onboarding.getStartedHint');
  });

  it('closes the card from "Get started"', async () => {
    const onDismiss = vi.fn();
    render(
      <OnboardingChecklist
        steps={[step('installCli', StepStatus.DONE)]}
        allDone
        onDismiss={onDismiss}
      />,
    );

    await userEvent.click(getStartedButton());

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('closes the card from the close button, whatever the steps say', async () => {
    // Both routes out record the same fact. Skipping the checklist is a thing
    // the user is allowed to do, at any point.
    const onDismiss = vi.fn();
    render(
      <OnboardingChecklist
        steps={[step('installCli', StepStatus.TODO)]}
        allDone={false}
        onDismiss={onDismiss}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'onboarding.close' }));

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
