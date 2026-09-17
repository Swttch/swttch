import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LoadedMessageDto } from '../../../../types';
import { LoadedMessageType, toInstance } from '../../../../dto/common';

// AuthErrorRenderer reads the auth context; without a provider it throws. Mock the
// context (as LoginCta's own test does) so the renderer can be unit-tested in
// isolation, with the login state and its check time driven per test.
const { authState, ctaProps, streamState, originState } = vi.hoisted(() => ({
  authState: { loggedIn: false as boolean | null, checkedAt: 0 },
  ctaProps: { authFailedAt: undefined as number | undefined },
  // The CLI's `system/init` as the webview holds it. `apiKeySource` is the field
  // that names which credential the CLI authenticated with (#446).
  streamState: { systemInit: null as Record<string, unknown> | null },
  // Where the backend says the variable is assigned. Undefined = lookup in flight.
  originState: { data: undefined as unknown },
}));

// The notice asks the backend where the variable lives. That query needs a bridge and
// a react-query client, neither of which this unit test has a use for.
vi.mock('@/hooks/queries/useEnvVarOriginsQuery', () => ({
  useEnvVarOriginsQuery: () => ({ data: originState.data }),
}));

vi.mock('@/contexts', () => ({
  useAuthContext: () => ({
    loggedIn: authState.loggedIn,
    checkedAt: authState.checkedAt,
    refetch: vi.fn(),
  }),
  useChatStreamContext: () => ({ systemInit: streamState.systemInit }),
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
    streamState.systemInit = null;
    originState.data = undefined;
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

  // A signed-in user who gets a 401 has no way to learn WHICH credential was
  // offered. In #446 the CLI had picked up an ANTHROPIC_API_KEY from the
  // environment the IDE inherited and used it instead of the login; the reporter
  // read the failure as "the plugin is broken, I am obviously authenticated".
  describe('credential source notice (#446)', () => {
    it('names the credential the CLI authenticated with', () => {
      streamState.systemInit = { apiKeySource: 'ANTHROPIC_API_KEY' };
      const { container } = render(<AuthErrorRenderer message={authErrorMessage()} />);
      expect(container.querySelector('.border-state-pending-border')).not.toBeNull();
      // Both the title and the hint interpolate the source, so the name appears twice.
      expect(screen.getAllByText(/ANTHROPIC_API_KEY/).length).toBeGreaterThan(0);
      expect(screen.getByText(/The server rejected ANTHROPIC_API_KEY/)).toBeInTheDocument();
    });

    it('stays silent when the CLI used the stored login', () => {
      // "none" is what the CLI reports when no API key overrode the login, which is
      // already what the user assumes — naming it would add noise, not an answer.
      streamState.systemInit = { apiKeySource: 'none' };
      const { container } = render(<AuthErrorRenderer message={authErrorMessage()} />);
      expect(container.querySelector('.border-state-pending-border')).toBeNull();
    });

    it('stays silent before any system/init has arrived', () => {
      streamState.systemInit = null;
      const { container } = render(<AuthErrorRenderer message={authErrorMessage()} />);
      expect(container.querySelector('.border-state-pending-border')).toBeNull();
    });

    it('점유 위치를 파일과 줄 번호로 보여준다', () => {
      // Being told the variable exists is only half an answer; the user still has to
      // find it. A shell file they wrote years ago is exactly what they cannot find.
      streamState.systemInit = { apiKeySource: 'ANTHROPIC_API_KEY' };
      originState.data = [
        { kind: 'shell-file', path: '~/.zshrc', line: 42 },
        { kind: 'dotenv', path: '~/proj/.env', line: 3 },
      ];

      render(<AuthErrorRenderer message={authErrorMessage()} />);

      expect(screen.getByText('~/.zshrc:42')).toBeInTheDocument();
      expect(screen.getByText('~/proj/.env:3')).toBeInTheDocument();
    });

    it('어디에도 없으면 그 사실과 다른 경로들을 알려준다', () => {
      // An empty result is an answer, not a failure: the variable came from the
      // command line, an exported shell session, launchctl/setx, or the parent process.
      streamState.systemInit = { apiKeySource: 'ANTHROPIC_API_KEY' };
      originState.data = [];

      render(<AuthErrorRenderer message={authErrorMessage()} />);

      expect(screen.getByText(/not assigned in any startup or settings file/i)).toBeInTheDocument();
    });

    it('조회 중에는 위치 줄을 그리지 않는다', () => {
      // The notice is useful without the locations, so nothing waits on the filesystem.
      streamState.systemInit = { apiKeySource: 'ANTHROPIC_API_KEY' };
      originState.data = undefined;

      render(<AuthErrorRenderer message={authErrorMessage()} />);

      expect(screen.getByText(/The server rejected ANTHROPIC_API_KEY/)).toBeInTheDocument();
      expect(screen.queryByText(/not assigned in any startup/i)).toBeNull();
    });

    it('키를 지우라고만 하지 않고 두 선택지를 함께 제시한다', () => {
      // Authenticating with an API key is supported. The failure is that THIS key was
      // rejected, not that keys are wrong, so the advice must not read as "stop using
      // API keys with this plugin".
      streamState.systemInit = { apiKeySource: 'ANTHROPIC_API_KEY' };

      render(<AuthErrorRenderer message={authErrorMessage()} />);

      expect(screen.getByText(/Check whether the key is still valid/i)).toBeInTheDocument();
      expect(screen.getByText(/or remove it to use your Claude login/i)).toBeInTheDocument();
    });

    it('stops advising once the failure is resolved', () => {
      // An auth check made after the failure means the user fixed it; a stale entry
      // further up the transcript must not keep telling them to remove a variable.
      streamState.systemInit = { apiKeySource: 'ANTHROPIC_API_KEY' };
      authState.loggedIn = true;
      authState.checkedAt = FAILED_AT + 1000;
      const { container } = render(<AuthErrorRenderer message={authErrorMessage()} />);
      expect(container.querySelector('.border-state-pending-border')).toBeNull();
    });
  });
});
