import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PermissionsSection } from '..';

interface MockNotificationStatic {
  permission: NotificationPermission;
  requestPermission: ReturnType<typeof vi.fn>;
}

function installNotificationMock(
  permission: NotificationPermission,
  requestResult: NotificationPermission = permission,
): MockNotificationStatic {
  const requestSpy = vi.fn().mockResolvedValue(requestResult);
  class MockNotification {
    static permission: NotificationPermission = permission;
    static requestPermission = requestSpy;
  }
  (globalThis as unknown as { Notification: unknown }).Notification = MockNotification;
  return MockNotification as unknown as MockNotificationStatic;
}

function uninstallNotificationMock() {
  delete (globalThis as unknown as { Notification?: unknown }).Notification;
}

beforeEach(() => {
  uninstallNotificationMock();
});

afterEach(() => {
  uninstallNotificationMock();
});

describe('PermissionsSection', () => {
  it('renders nothing when Notification API is unavailable', () => {
    const { container } = render(<PermissionsSection />);
    // No row labels should appear
    expect(container.textContent).not.toContain('Desktop Notifications');
  });

  describe('when permission is "default"', () => {
    it('renders a Request button', () => {
      installNotificationMock('default');
      render(<PermissionsSection />);
      expect(screen.getByText('Desktop Notifications')).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /request/i }),
      ).toBeInTheDocument();
    });

    it('calls requestPermission when Request is clicked', async () => {
      const mock = installNotificationMock('default', 'granted');
      render(<PermissionsSection />);
      fireEvent.click(screen.getByRole('button', { name: /request/i }));
      await waitFor(() => {
        expect(mock.requestPermission).toHaveBeenCalledTimes(1);
      });
    });

    it('updates UI to "Granted" after request resolves with granted', async () => {
      installNotificationMock('default', 'granted');
      render(<PermissionsSection />);
      fireEvent.click(screen.getByRole('button', { name: /request/i }));
      await waitFor(() => {
        expect(screen.getByText(/granted/i)).toBeInTheDocument();
      });
    });
  });

  describe('when permission is "granted"', () => {
    it('shows a Granted indicator', () => {
      installNotificationMock('granted');
      render(<PermissionsSection />);
      expect(screen.getByText(/granted/i)).toBeInTheDocument();
    });

    it('does not show a Request button', () => {
      installNotificationMock('granted');
      render(<PermissionsSection />);
      expect(
        screen.queryByRole('button', { name: /request/i }),
      ).not.toBeInTheDocument();
    });
  });

  describe('when permission is "denied"', () => {
    it('shows browser-settings guidance', () => {
      installNotificationMock('denied');
      render(<PermissionsSection />);
      expect(
        screen.getByText(/enable from browser settings/i),
      ).toBeInTheDocument();
    });

    it('does not show a Request button', () => {
      installNotificationMock('denied');
      render(<PermissionsSection />);
      expect(
        screen.queryByRole('button', { name: /request/i }),
      ).not.toBeInTheDocument();
    });
  });
});
