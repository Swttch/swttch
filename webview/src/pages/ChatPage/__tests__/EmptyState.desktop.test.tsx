import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TopBarProvider, TOP_BAR_HEIGHT } from '@/contexts/TopBarContext';
import { APP_NAME } from '@/config/app';

vi.mock('@/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/components/Tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../ClawdWalk', () => ({
  ClawdWalk: () => <div data-testid="clawd" />,
}));

vi.mock('../runner/RunnerGame', () => ({
  RunnerGame: () => null,
}));

vi.mock('@/components/Announcements/placements', () => ({
  AnnouncementEmptyStateSlot: () => null,
}));

vi.mock('@/contexts/OnboardingContext', () => ({
  useOnboarding: () => ({ steps: [], visible: false, allDone: false, dismiss: vi.fn() }),
}));

import { EmptyState } from '../EmptyState';

/**
 * The room left above the logo row, which is what sits against the top edge.
 * Null when nothing was put above it.
 */
const roomAboveLogo = () => {
  const row = screen.getByAltText(APP_NAME).parentElement as HTMLElement;
  return (row.previousElementSibling as HTMLElement | null)?.style.height ?? null;
};

/**
 * Without the top bar the logo sat a bar's height closer to the top edge than it
 * did with it. The Desktop app draws its own header above the page, so the logo
 * gets that height back there, and only there: a browser that hides the bar by
 * the older name keeps the logo where it was.
 */
describe('EmptyState logo position', () => {
  it('moves the logo down by the height of the top bar in the Desktop app', () => {
    render(
      <TopBarProvider displayed={false} desktop>
        <EmptyState />
      </TopBarProvider>,
    );

    expect(roomAboveLogo()).toBe(`${TOP_BAR_HEIGHT}px`);
  });

  it('leaves the logo where it was when the page is not the Desktop app, whether or not the bar is drawn', () => {
    for (const displayed of [true, false]) {
      const { unmount } = render(
        <TopBarProvider displayed={displayed} desktop={false}>
          <EmptyState />
        </TopBarProvider>,
      );

      expect(roomAboveLogo()).toBeNull();

      unmount();
    }
  });

  it('leaves the logo where it was outside any provider', () => {
    render(<EmptyState />);

    expect(roomAboveLogo()).toBeNull();
  });
});
