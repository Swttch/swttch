import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StepStatus, type ChecklistStep } from '../Onboarding/types';

vi.mock('@/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/components/Tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

/** Stood in because it animates and reaches for assets this file does not care about. */
vi.mock('../ClawdWalk', () => ({
  ClawdWalk: () => <div data-testid="clawd" />,
}));

vi.mock('../runner/RunnerGame', () => ({
  RunnerGame: () => null,
}));

vi.mock('@/components/Announcements/placements', () => ({
  AnnouncementEmptyStateSlot: () => null,
}));

/** What the onboarding context reports for the render under test. */
let onboarding: {
  steps: ChecklistStep[];
  visible: boolean;
  allDone: boolean;
  dismiss: () => void;
};

vi.mock('@/contexts/OnboardingContext', () => ({
  useOnboarding: () => onboarding,
}));

import { EmptyState } from '../EmptyState';

const step = (id: string, status: StepStatus): ChecklistStep => ({ id, status, actions: [] });

const card = () => screen.queryByText('onboarding.title');

beforeEach(() => {
  onboarding = { steps: [], visible: false, allDone: false, dismiss: vi.fn() };
});

/**
 * The one screen the setup card is ever drawn on.
 *
 * It is raised once per install, and a first run has no conversation to have
 * scrolled past, so this is where it belongs. What must not happen again is the
 * card quietly not being drawn at all while the composer is still turned off —
 * that was #482, and nothing was guarding the render.
 */
describe('EmptyState onboarding card', () => {
  it('stands the card in place of the usual empty state while it is up', () => {
    onboarding = {
      steps: [step('installCli', StepStatus.TODO)],
      visible: true,
      allDone: false,
      dismiss: vi.fn(),
    };

    render(<EmptyState />);

    expect(card()).toBeInTheDocument();
    // Clawd and the rotating tip say "nothing to do here", which is exactly what
    // is not true while setup is still being asked for.
    expect(screen.queryByTestId('clawd')).toBeNull();
  });

  it('gives the screen back once the card has been closed', () => {
    onboarding = {
      steps: [step('installCli', StepStatus.TODO)],
      visible: false,
      allDone: false,
      dismiss: vi.fn(),
    };

    render(<EmptyState />);

    expect(card()).toBeNull();
    expect(screen.getByTestId('clawd')).toBeInTheDocument();
  });

  it('draws the card from the same value the composer dims on', () => {
    // The card and the dimming are two branches of the tree reading one value.
    // Read from anything else, they would drift, and a dimmed composer with no
    // card anywhere is the failure that has no symptom until a user reports it.
    for (const visible of [true, false]) {
      onboarding = {
        steps: [step('installCli', StepStatus.TODO)],
        visible,
        allDone: false,
        dismiss: vi.fn(),
      };
      const { unmount } = render(<EmptyState />);

      expect(card() !== null).toBe(visible);

      unmount();
    }
  });
});
