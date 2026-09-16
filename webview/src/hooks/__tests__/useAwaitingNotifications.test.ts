import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { NotificationKind, SOUND_OFF } from '@/notifications';
import { FAVICON_DEFAULT, hasUnreadFavicon, restoreDefaultFavicon } from '../favicon';

const notifyMock = vi.fn();

vi.mock('@/notifications', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/notifications')>();
  return {
    ...actual,
    notify: (...args: unknown[]) => notifyMock(...args),
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
  notifyMock.mockReset();
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
  it('does not notify when nothing is pending', () => {
    setHidden(true);
    renderHook(() =>
      useAwaitingNotifications('S', SOUND_OFF, {
        pendingPermission: false,
        pendingPlanApproval: false,
        pendingUserAnswer: false,
      }),
    );
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it('fires AWAITING_PLAN_APPROVAL when a plan becomes pending while hidden', () => {
    setHidden(true);
    const { rerender } = renderHook(
      ({ pending }) =>
        useAwaitingNotifications('Session A', SOUND_OFF, {
          pendingPermission: false,
          pendingPlanApproval: pending,
          pendingUserAnswer: false,
        }),
      { initialProps: { pending: false } },
    );

    notifyMock.mockReset();
    rerender({ pending: true });

    expect(notifyMock).toHaveBeenCalledTimes(1);
    expect(notifyMock).toHaveBeenCalledWith(
      NotificationKind.AWAITING_PLAN_APPROVAL,
      { sessionTitle: 'Session A' },
      SOUND_OFF,
    );
  });

  it('does NOT fire AWAITING_PLAN_APPROVAL while tab is visible', () => {
    setHidden(false);
    const { rerender } = renderHook(
      ({ pending }) =>
        useAwaitingNotifications('Session A', SOUND_OFF, {
          pendingPermission: false,
          pendingPlanApproval: pending,
          pendingUserAnswer: false,
        }),
      { initialProps: { pending: false } },
    );

    notifyMock.mockReset();
    rerender({ pending: true });

    expect(notifyMock).not.toHaveBeenCalled();
  });

  it('fires AWAITING_PERMISSION when a permission becomes pending while hidden', () => {
    setHidden(true);
    const { rerender } = renderHook(
      ({ pending }) =>
        useAwaitingNotifications('Session A', SOUND_OFF, { pendingPermission: pending, pendingPlanApproval: false, pendingUserAnswer: false }),
      { initialProps: { pending: false } },
    );

    notifyMock.mockReset();
    rerender({ pending: true });

    expect(notifyMock).toHaveBeenCalledTimes(1);
    expect(notifyMock).toHaveBeenCalledWith(
      NotificationKind.AWAITING_PERMISSION,
      { sessionTitle: 'Session A' },
      SOUND_OFF,
    );
  });

  it('does NOT fire when the tab is visible', () => {
    setHidden(false);
    const { rerender } = renderHook(
      ({ pending }) =>
        useAwaitingNotifications('Session A', SOUND_OFF, { pendingPermission: pending, pendingPlanApproval: false, pendingUserAnswer: false }),
      { initialProps: { pending: false } },
    );

    notifyMock.mockReset();
    rerender({ pending: true });

    expect(notifyMock).not.toHaveBeenCalled();
  });

  it('does NOT fire again while a permission stays pending', () => {
    setHidden(true);
    const { rerender } = renderHook(
      ({ pending }) =>
        useAwaitingNotifications('Session A', SOUND_OFF, { pendingPermission: pending, pendingPlanApproval: false, pendingUserAnswer: false }),
      { initialProps: { pending: false } },
    );

    rerender({ pending: true });
    notifyMock.mockReset();
    rerender({ pending: true });

    expect(notifyMock).not.toHaveBeenCalled();
  });

  it('fires again after the pending state clears and a new one arrives', () => {
    setHidden(true);
    const { rerender } = renderHook(
      ({ pending }) =>
        useAwaitingNotifications('Session A', SOUND_OFF, { pendingPermission: pending, pendingPlanApproval: false, pendingUserAnswer: false }),
      { initialProps: { pending: false } },
    );

    rerender({ pending: true });
    rerender({ pending: false });
    notifyMock.mockReset();
    rerender({ pending: true });

    expect(notifyMock).toHaveBeenCalledTimes(1);
  });

  it('passes the latest sessionTitle and sound selection', () => {
    setHidden(true);
    const { rerender } = renderHook(
      ({ title, sound, pending }) =>
        useAwaitingNotifications(title, sound, { pendingPermission: pending, pendingPlanApproval: false, pendingUserAnswer: false }),
      { initialProps: { title: 'A', sound: SOUND_OFF as string, pending: false } },
    );

    rerender({ title: 'B', sound: 'Glass', pending: false });
    notifyMock.mockReset();
    rerender({ title: 'B', sound: 'Glass', pending: true });

    expect(notifyMock).toHaveBeenCalledWith(
      NotificationKind.AWAITING_PERMISSION,
      { sessionTitle: 'B' },
      'Glass',
    );
  });

  it('fires AWAITING_USER_INPUT when a user-question becomes pending while hidden', () => {
    setHidden(true);
    const { rerender } = renderHook(
      ({ pending }) =>
        useAwaitingNotifications('Session A', SOUND_OFF, {
          pendingPermission: false,
          pendingPlanApproval: false,
          pendingUserAnswer: pending,
        }),
      { initialProps: { pending: false } },
    );

    notifyMock.mockReset();
    rerender({ pending: true });

    expect(notifyMock).toHaveBeenCalledTimes(1);
    expect(notifyMock).toHaveBeenCalledWith(
      NotificationKind.AWAITING_USER_INPUT,
      { sessionTitle: 'Session A' },
      SOUND_OFF,
    );
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
          useAwaitingNotifications('Session A', SOUND_OFF, {
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

  it('does NOT fire AWAITING_USER_INPUT while tab is visible', () => {
    setHidden(false);
    const { rerender } = renderHook(
      ({ pending }) =>
        useAwaitingNotifications('Session A', SOUND_OFF, {
          pendingPermission: false,
          pendingPlanApproval: false,
          pendingUserAnswer: pending,
        }),
      { initialProps: { pending: false } },
    );

    notifyMock.mockReset();
    rerender({ pending: true });

    expect(notifyMock).not.toHaveBeenCalled();
  });
});
