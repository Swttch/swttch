import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { NotificationKind } from '@/notifications';
import { FAVICON_DEFAULT, hasUnreadFavicon, restoreDefaultFavicon } from '../favicon';

const playSoundMock = vi.fn();
const showBannerMock = vi.fn();

vi.mock('@/notifications', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/notifications')>();
  return {
    ...actual,
    playNotificationSound: (...args: unknown[]) => playSoundMock(...args),
    showNotificationBanner: (...args: unknown[]) => showBannerMock(...args),
  };
});

import { useAwaitingNotifications } from '../useAwaitingNotifications';

function setHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', {
    configurable: true,
    get: () => hidden,
  });
}

let faviconLink: HTMLLinkElement;

beforeEach(() => {
  playSoundMock.mockReset();
  showBannerMock.mockReset();
  setHidden(false);
  faviconLink = document.createElement('link');
  faviconLink.rel = 'icon';
  faviconLink.href = FAVICON_DEFAULT;
  document.head.appendChild(faviconLink);
});

afterEach(() => {
  setHidden(false);
  restoreDefaultFavicon();
  faviconLink.remove();
});

describe('useAwaitingNotifications', () => {
  it('does nothing when nothing is pending', () => {
    setHidden(true);
    renderHook(() =>
      useAwaitingNotifications('S', {
        pendingPermission: false,
        pendingPlanApproval: false,
        pendingUserAnswer: false,
      }),
    );
    expect(showBannerMock).not.toHaveBeenCalled();
    expect(playSoundMock).not.toHaveBeenCalled();
  });

  it('shows the AWAITING_PLAN_APPROVAL banner when a plan becomes pending while hidden', () => {
    setHidden(true);
    const { rerender } = renderHook(
      ({ pending }) =>
        useAwaitingNotifications('Session A', {
          pendingPermission: false,
          pendingPlanApproval: pending,
          pendingUserAnswer: false,
        }),
      { initialProps: { pending: false } },
    );

    showBannerMock.mockReset();
    rerender({ pending: true });

    expect(showBannerMock).toHaveBeenCalledTimes(1);
    expect(showBannerMock).toHaveBeenCalledWith(NotificationKind.AWAITING_PLAN_APPROVAL, {
      sessionTitle: 'Session A',
    });
  });

  it('does NOT show the AWAITING_PLAN_APPROVAL banner while tab is visible', () => {
    setHidden(false);
    const { rerender } = renderHook(
      ({ pending }) =>
        useAwaitingNotifications('Session A', {
          pendingPermission: false,
          pendingPlanApproval: pending,
          pendingUserAnswer: false,
        }),
      { initialProps: { pending: false } },
    );

    showBannerMock.mockReset();
    rerender({ pending: true });

    expect(showBannerMock).not.toHaveBeenCalled();
  });

  it('shows the AWAITING_PERMISSION banner when a permission becomes pending while hidden', () => {
    setHidden(true);
    const { rerender } = renderHook(
      ({ pending }) =>
        useAwaitingNotifications('Session A', { pendingPermission: pending, pendingPlanApproval: false, pendingUserAnswer: false }),
      { initialProps: { pending: false } },
    );

    showBannerMock.mockReset();
    rerender({ pending: true });

    expect(showBannerMock).toHaveBeenCalledTimes(1);
    expect(showBannerMock).toHaveBeenCalledWith(NotificationKind.AWAITING_PERMISSION, {
      sessionTitle: 'Session A',
    });
  });

  it('does NOT show a banner when the tab is visible', () => {
    setHidden(false);
    const { rerender } = renderHook(
      ({ pending }) =>
        useAwaitingNotifications('Session A', { pendingPermission: pending, pendingPlanApproval: false, pendingUserAnswer: false }),
      { initialProps: { pending: false } },
    );

    showBannerMock.mockReset();
    rerender({ pending: true });

    expect(showBannerMock).not.toHaveBeenCalled();
  });

  it('does NOT fire again while a permission stays pending', () => {
    setHidden(true);
    const { rerender } = renderHook(
      ({ pending }) =>
        useAwaitingNotifications('Session A', { pendingPermission: pending, pendingPlanApproval: false, pendingUserAnswer: false }),
      { initialProps: { pending: false } },
    );

    rerender({ pending: true });
    showBannerMock.mockReset();
    rerender({ pending: true });

    expect(showBannerMock).not.toHaveBeenCalled();
  });

  it('fires again after the pending state clears and a new one arrives', () => {
    setHidden(true);
    const { rerender } = renderHook(
      ({ pending }) =>
        useAwaitingNotifications('Session A', { pendingPermission: pending, pendingPlanApproval: false, pendingUserAnswer: false }),
      { initialProps: { pending: false } },
    );

    rerender({ pending: true });
    rerender({ pending: false });
    showBannerMock.mockReset();
    rerender({ pending: true });

    expect(showBannerMock).toHaveBeenCalledTimes(1);
  });

  it('passes the latest sessionTitle, and names no sound', () => {
    setHidden(true);
    const { rerender } = renderHook(
      ({ title, pending }) =>
        useAwaitingNotifications(title, { pendingPermission: pending, pendingPlanApproval: false, pendingUserAnswer: false }),
      { initialProps: { title: 'A', pending: false } },
    );

    rerender({ title: 'B', pending: false });
    showBannerMock.mockReset();
    playSoundMock.mockReset();
    rerender({ title: 'B', pending: true });

    expect(showBannerMock).toHaveBeenCalledWith(NotificationKind.AWAITING_PERMISSION, {
      sessionTitle: 'B',
    });
    // A name here is a copy that can go out of date; the backend keeps the only
    // one there is.
    expect(playSoundMock).toHaveBeenCalledWith();
  });

  it('shows the AWAITING_USER_INPUT banner when a user-question becomes pending while hidden', () => {
    setHidden(true);
    const { rerender } = renderHook(
      ({ pending }) =>
        useAwaitingNotifications('Session A', {
          pendingPermission: false,
          pendingPlanApproval: false,
          pendingUserAnswer: pending,
        }),
      { initialProps: { pending: false } },
    );

    showBannerMock.mockReset();
    rerender({ pending: true });

    expect(showBannerMock).toHaveBeenCalledTimes(1);
    expect(showBannerMock).toHaveBeenCalledWith(NotificationKind.AWAITING_USER_INPUT, {
      sessionTitle: 'Session A',
    });
  });

  // Regression guard for issue #456. This hook used to set the unread favicon
  // alongside each notification, behind the same `document.hidden` condition —
  // which meant the tab in front of the user never wore the badge, and the
  // streaming spinner overwrote it on the next frame for the tab that did.
  // The badge now belongs to useDocumentTitle, which owns the favicon outright.
  it('leaves the favicon alone, hidden or not', () => {
    for (const hidden of [true, false]) {
      restoreDefaultFavicon();
      setHidden(hidden);
      const { rerender, unmount } = renderHook(
        ({ pending }) =>
          useAwaitingNotifications('Session A', {
            pendingPermission: pending,
            pendingPlanApproval: pending,
            pendingUserAnswer: pending,
          }),
        { initialProps: { pending: false } },
      );

      rerender({ pending: true });

      expect(hasUnreadFavicon()).toBe(false);
      unmount();
    }
  });

  it('does NOT show the AWAITING_USER_INPUT banner while tab is visible', () => {
    setHidden(false);
    const { rerender } = renderHook(
      ({ pending }) =>
        useAwaitingNotifications('Session A', {
          pendingPermission: false,
          pendingPlanApproval: false,
          pendingUserAnswer: pending,
        }),
      { initialProps: { pending: false } },
    );

    showBannerMock.mockReset();
    rerender({ pending: true });

    expect(showBannerMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// The sound is not a passenger on the banner.
//
// A session that stops to ask something is one of the two moments the sound is
// for — the other being a turn that just ended — and it must reach the user
// whether or not a banner could. Each test puts the banner out of reach by a
// different route and asserts the sound still went out.
// ---------------------------------------------------------------------------
describe('useAwaitingNotifications – the sound is independent of the banner', () => {
  it('plays the sound while the tab is VISIBLE (no banner)', () => {
    setHidden(false);
    const { rerender } = renderHook(
      ({ pending }) =>
        useAwaitingNotifications('Session A', {
          pendingPermission: pending,
          pendingPlanApproval: false,
          pendingUserAnswer: false,
        }),
      { initialProps: { pending: false } },
    );

    playSoundMock.mockReset();
    showBannerMock.mockReset();
    rerender({ pending: true });

    expect(playSoundMock).toHaveBeenCalledTimes(1);
    expect(showBannerMock).not.toHaveBeenCalled();
  });

  // The user switching banners off is no longer visible from here: that answer
  // lives in the settings file and is read by the backend as the banner would
  // be raised. It is covered in the showNotification handler's suite.

  it('still shows the banner when the tab is hidden', () => {
    // The mirror image of the test above: proves it fails for the reason
    // claimed (the gate) rather than because nothing ever raises a banner.
    setHidden(true);
    const { rerender } = renderHook(
      ({ pending }) =>
        useAwaitingNotifications('Session A', {
          pendingPermission: pending,
          pendingPlanApproval: false,
          pendingUserAnswer: false,
        }),
      { initialProps: { pending: false } },
    );

    playSoundMock.mockReset();
    showBannerMock.mockReset();
    rerender({ pending: true });

    expect(playSoundMock).toHaveBeenCalledTimes(1);
    expect(showBannerMock).toHaveBeenCalledTimes(1);
  });
});
