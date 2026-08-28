import { useState } from 'react';
import { ArrowRightOnRectangleIcon } from '@heroicons/react/24/outline';
import { useNavigateToLogin } from '@/hooks';
import { useAuthContext } from '@/contexts';
import { useTranslation } from '@/i18n';

interface Props {
  /**
   * When this control sits next to a CLI authentication failure, the epoch ms of
   * that failure. The button then reports the state that failure describes —
   * logged out — unless auth was re-confirmed after it. Omit when the control is
   * not tied to a specific failure.
   */
  authFailedAt?: number;
  className?: string;
}

/**
 * Status-aware login control shown next to a CLI authentication-failure message.
 *
 * Same size/background/text-color in both states — only opacity differs:
 * - Logged in:  "Signed", dimmed (50%), inactive. Clicking silently re-checks
 *   auth status (spinner shows while in flight) without leaving the chat.
 * - Logged out: "Re-Sign", full opacity, active. Clicking opens the login page.
 *
 * It never disappears, so a stale auth error in the transcript reads correctly:
 * dimmed "Signed" once the user is authenticated again, prominent "Re-Sign"
 * while still logged out.
 *
 * `loggedIn` alone cannot decide that, because `claude auth status` reports the
 * stored credentials rather than whether the API still accepts them: a revoked
 * token keeps answering "logged in" while every request 401s. Believing it left
 * the button showing an inactive "Signed" right beside a "401 OAuth access token
 * has been revoked" line, with no way to reach the login page. So a `loggedIn`
 * that predates the failure is treated as stale and the failure wins.
 */
export function LoginCta(props: Props) {
  const { authFailedAt, className = '' } = props;
  const { t } = useTranslation('chat');
  const navigateToLogin = useNavigateToLogin();
  const { loggedIn, checkedAt, refetch } = useAuthContext();
  const [isRechecking, setIsRechecking] = useState(false);

  const staleAfterFailure = authFailedAt !== undefined && checkedAt <= authFailedAt;
  const isSignedIn = loggedIn === true && !staleAfterFailure;

  const handleClick = async () => {
    if (isSignedIn) {
      if (isRechecking) return;
      setIsRechecking(true);
      try {
        await refetch();
      } finally {
        setIsRechecking(false);
      }
      return;
    }
    navigateToLogin();
  };

  return (
    <button
      type="button"
      onClick={() => { void handleClick(); }}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-accent-claude text-white transition-opacity ${isSignedIn ? 'opacity-50 hover:opacity-60' : 'opacity-100 hover:bg-accent-claude-hover'} ${className}`}
    >
      {isRechecking ? (
        <span className="w-3.5 h-3.5 border-2 border-border-strong border-t-white rounded-full animate-spin" />
      ) : (
        <ArrowRightOnRectangleIcon className="w-3.5 h-3.5 rtl:-scale-x-100" />
      )}
      {isSignedIn ? t('loginCta.signed') : t('loginCta.reSign')}
    </button>
  );
}
