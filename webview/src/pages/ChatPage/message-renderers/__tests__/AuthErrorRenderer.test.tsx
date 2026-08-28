import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LoadedMessageDto } from '../../../../types';
import { LoadedMessageType, toInstance } from '../../../../dto/common';

// AuthErrorRenderer reads the auth context; without a provider it throws. Mock the
// context (as LoginCta's own test does) so the renderer can be unit-tested in
// isolation, with the login state and its check time driven per test.
const { authState, ctaProps } = vi.hoisted(() => ({
  authState: { loggedIn: false as boolean | null, checkedAt: 0 },
  ctaProps: { authFailedAt: undefined as number | undefined },
}));

vi.mock('@/contexts', () => ({
  useAuthContext: () => ({
    loggedIn: authState.loggedIn,
    checkedAt: authState.checkedAt,
    refetch: vi.fn(),
  }),
}));

vi.mock('../../LoginCta', () => ({
  LoginCta: (props: { authFailedAt?: number }) => {
    ctaProps.authFailedAt = props.authFailedAt;
    return <button data-testid="login-cta">Re-Sign</button>;
  },
}));

import { AuthErrorRenderer } from '../AuthErrorRenderer';

const FAILED_AT_ISO = '2026-08-29T10:00:00.000Z';
const FAILED_AT = Date.parse(FAILED_AT_ISO);

function authErrorMessage(overrides: Record<string, unknown> = {}): LoadedMessageDto {
  return toInstance(LoadedMessageDto, {
    type: LoadedMessageType.Assistant,
    message: {
      role: 'assistant',
      content: [{ type: 'text', text: 'Failed to authenticate. API Error: 401 Invalid authentication credentials' }],
    },
    isApiErrorMessage: true,
    apiErrorStatus: 401,
    error: 'authentication_failed',
    timestamp: FAILED_AT_ISO,
    ...overrides,
  });
}

describe('AuthErrorRenderer', () => {
  beforeEach(() => {
    authState.loggedIn = false;
    authState.checkedAt = 0;
    ctaProps.authFailedAt = undefined;
  });

  it('renders the error text', () => {
    render(<AuthErrorRenderer message={authErrorMessage()} />);
    expect(screen.getByText(/failed to authenticate/i)).toBeInTheDocument();
  });

  it('renders the inline login CTA', () => {
    render(<AuthErrorRenderer message={authErrorMessage()} />);
    expect(screen.getByTestId('login-cta')).toBeInTheDocument();
  });

  it('shows the red status dot', () => {
    const { container } = render(<AuthErrorRenderer message={authErrorMessage()} />);
    expect(container.querySelector('.text-red-500')).not.toBeNull();
  });

  it('passes the failure time to the CTA so it can date the login state', () => {
    render(<AuthErrorRenderer message={authErrorMessage()} />);
    expect(ctaProps.authFailedAt).toBe(FAILED_AT);
  });

  // The reported bug: `claude auth status` still answered loggedIn:true after the
  // token was revoked, so the line rendered a green dot next to "401 OAuth access
  // token has been revoked".
  it('keeps the dot red when the logged-in state predates the failure', () => {
    authState.loggedIn = true;
    authState.checkedAt = FAILED_AT - 1;
    const { container } = render(<AuthErrorRenderer message={authErrorMessage()} />);
    expect(container.querySelector('.text-red-500')).not.toBeNull();
    expect(container.querySelector('.text-green-500')).toBeNull();
  });

  it('turns the dot green once auth is re-confirmed after the failure', () => {
    authState.loggedIn = true;
    authState.checkedAt = FAILED_AT + 1;
    const { container } = render(<AuthErrorRenderer message={authErrorMessage()} />);
    expect(container.querySelector('.text-green-500')).not.toBeNull();
    expect(container.querySelector('.text-red-500')).toBeNull();
  });

  it('keeps the failure standing when the entry carries no usable timestamp', () => {
    authState.loggedIn = true;
    authState.checkedAt = Number.MAX_SAFE_INTEGER;
    const { container } = render(<AuthErrorRenderer message={authErrorMessage({ timestamp: undefined })} />);
    expect(container.querySelector('.text-red-500')).not.toBeNull();
    expect(ctaProps.authFailedAt).toBe(Infinity);
  });

  // Verbatim entry the CLI wrote to its JSONL transcript (session 4b4c26d7,
  // 2026-08-06), trimmed only of the unrelated `usage` block. Guards the fields
  // this renderer depends on — `timestamp` above all — against drift in the CLI's
  // own output, which no hand-written fixture would catch.
  describe('on a real CLI transcript entry', () => {
    const REAL_ENTRY = {
      parentUuid: '5e60f390-2ac3-4727-94bb-6eab2dff8165',
      isSidechain: false,
      type: LoadedMessageType.Assistant,
      uuid: '117b962d-2d73-4a1e-b5c4-407dd377adce',
      timestamp: '2026-08-06T03:22:19.029Z',
      message: {
        id: 'ee3f2acd-0960-441c-b237-acefd822d69b',
        model: '<synthetic>',
        role: 'assistant',
        stop_reason: 'stop_sequence',
        type: 'message',
        content: [{
          type: 'text',
          text: 'Failed to authenticate. API Error: 401 OAuth access token has expired. Re-authenticate to continue.',
        }],
      },
      error: 'authentication_failed',
      isApiErrorMessage: true,
      apiErrorStatus: 401,
    };

    it('dates the failure from the entry\'s own timestamp', () => {
      render(<AuthErrorRenderer message={toInstance(LoadedMessageDto, REAL_ENTRY)} />);
      expect(ctaProps.authFailedAt).toBe(Date.parse('2026-08-06T03:22:19.029Z'));
    });

    it('reports logged out while `auth status` still claims otherwise', () => {
      authState.loggedIn = true;
      authState.checkedAt = Date.parse('2026-08-06T03:00:00.000Z');
      const { container } = render(<AuthErrorRenderer message={toInstance(LoadedMessageDto, REAL_ENTRY)} />);
      expect(container.querySelector('.text-red-500')).not.toBeNull();
    });
  });
});
