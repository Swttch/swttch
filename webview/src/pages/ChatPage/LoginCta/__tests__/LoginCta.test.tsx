import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const { mockNavigateToLogin, mockRefetch, authState } = vi.hoisted(() => ({
  mockNavigateToLogin: vi.fn(),
  mockRefetch: vi.fn(),
  authState: { loggedIn: null as boolean | null, checkedAt: 0 },
}));

vi.mock('@/hooks', () => ({
  useNavigateToLogin: () => mockNavigateToLogin,
}));

vi.mock('@/contexts', () => ({
  useAuthContext: () => ({
    loggedIn: authState.loggedIn,
    checkedAt: authState.checkedAt,
    refetch: mockRefetch,
  }),
}));

import { LoginCta } from '../index';

const FAILED_AT = 1_000;

describe('LoginCta', () => {
  beforeEach(() => {
    mockNavigateToLogin.mockReset();
    mockRefetch.mockReset();
    mockRefetch.mockResolvedValue(undefined);
    authState.loggedIn = null;
    authState.checkedAt = 0;
  });

  describe('when logged out', () => {
    beforeEach(() => { authState.loggedIn = false; });

    it('shows "Re-Sign" at full opacity', () => {
      const { container } = render(<LoginCta />);
      expect(screen.getByRole('button', { name: /re-sign/i })).toBeInTheDocument();
      expect(container.querySelector('.opacity-50')).toBeNull();
    });

    it('navigates to the login page when clicked', () => {
      render(<LoginCta />);
      fireEvent.click(screen.getByRole('button', { name: /re-sign/i }));
      expect(mockNavigateToLogin).toHaveBeenCalled();
      expect(mockRefetch).not.toHaveBeenCalled();
    });
  });

  describe('when login state is undetermined (null)', () => {
    it('shows "Re-Sign" (active) and navigates on click', () => {
      authState.loggedIn = null;
      render(<LoginCta />);
      fireEvent.click(screen.getByRole('button', { name: /re-sign/i }));
      expect(mockNavigateToLogin).toHaveBeenCalled();
    });
  });

  describe('when logged in', () => {
    beforeEach(() => { authState.loggedIn = true; });

    it('shows "Signed" dimmed at 50% opacity (does not hide)', () => {
      const { container } = render(<LoginCta />);
      expect(screen.getByRole('button', { name: /signed/i })).toBeInTheDocument();
      expect(container.querySelector('.opacity-50')).not.toBeNull();
    });

    it('re-checks auth status on click instead of navigating', () => {
      render(<LoginCta />);
      fireEvent.click(screen.getByRole('button', { name: /signed/i }));
      expect(mockRefetch).toHaveBeenCalled();
      expect(mockNavigateToLogin).not.toHaveBeenCalled();
    });

    it('shows a spinner while the silent re-check is in flight', async () => {
      let resolveRefetch: () => void = () => {};
      mockRefetch.mockReturnValue(new Promise<void>((r) => { resolveRefetch = r; }));
      const { container } = render(<LoginCta />);
      fireEvent.click(screen.getByRole('button', { name: /signed/i }));
      expect(container.querySelector('.animate-spin')).not.toBeNull();
      resolveRefetch();
      await waitFor(() => expect(container.querySelector('.animate-spin')).toBeNull());
    });
  });

  // `claude auth status` reports the STORED credentials, not whether the API still
  // accepts them, so a revoked token keeps answering loggedIn:true. Beside a 401
  // entry that made the button show an inactive "Signed" with no route to login.
  describe('next to an authentication failure', () => {
    beforeEach(() => { authState.loggedIn = true; });

    it('shows "Re-Sign" when the logged-in state predates the failure', () => {
      authState.checkedAt = FAILED_AT - 1;
      const { container } = render(<LoginCta authFailedAt={FAILED_AT} />);
      expect(screen.getByRole('button', { name: /re-sign/i })).toBeInTheDocument();
      expect(container.querySelector('.opacity-50')).toBeNull();
    });

    it('navigates to the login page when clicked in that state', () => {
      authState.checkedAt = FAILED_AT - 1;
      render(<LoginCta authFailedAt={FAILED_AT} />);
      fireEvent.click(screen.getByRole('button', { name: /re-sign/i }));
      expect(mockNavigateToLogin).toHaveBeenCalled();
      expect(mockRefetch).not.toHaveBeenCalled();
    });

    it('treats an auth check made at the very moment of the failure as stale', () => {
      authState.checkedAt = FAILED_AT;
      render(<LoginCta authFailedAt={FAILED_AT} />);
      expect(screen.getByRole('button', { name: /re-sign/i })).toBeInTheDocument();
    });

    it('shows "Signed" once auth is re-confirmed AFTER the failure', () => {
      authState.checkedAt = FAILED_AT + 1;
      const { container } = render(<LoginCta authFailedAt={FAILED_AT} />);
      expect(screen.getByRole('button', { name: /signed/i })).toBeInTheDocument();
      expect(container.querySelector('.opacity-50')).not.toBeNull();
    });

    it('still shows "Re-Sign" when logged out, whenever the check happened', () => {
      authState.loggedIn = false;
      authState.checkedAt = FAILED_AT + 1;
      render(<LoginCta authFailedAt={FAILED_AT} />);
      expect(screen.getByRole('button', { name: /re-sign/i })).toBeInTheDocument();
    });
  });

  it('renders its label on the orange fill in white, not the theme text colour', () => {
    // The fill is theme-independent, so a theme-derived foreground (text-primary,
    // which follows the IDE editor colour when theme sync is on) can land unreadable
    // on it — as it did here.
    authState.loggedIn = false;
    const { container } = render(<LoginCta />);
    const button = container.querySelector('button');
    expect(button?.className).toContain('text-white');
    expect(button?.className).not.toContain('text-text-primary');
  });
});
