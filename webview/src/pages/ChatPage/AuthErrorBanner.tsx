import { ArrowRightOnRectangleIcon } from '@heroicons/react/24/outline';
import { useAuthContext } from '@/contexts';
import { useNavigateToLogin } from '@/hooks';
import { useTranslation } from '@/i18n';

/**
 * Top banner shown ONLY when `auth status` definitively reports logged-out
 * (loggedIn === false). An undetermined/transient check (loggedIn === null) renders
 * nothing — this is the calm alternative to the old auto-redirect that bounced the
 * user to the login page on every failed status check (#178).
 *
 * Same shape as {@link ConnectionLostBanner}, plus a right-aligned login button
 * that PUSHes to the login page (remembering the current session as fallback).
 */
export function AuthErrorBanner() {
  const { loggedIn } = useAuthContext();
  const navigateToLogin = useNavigateToLogin();
  const { t } = useTranslation('chat');

  if (loggedIn !== false) return null;

  return (
    <div className="w-full z-20 border-t border-b border-state-warning-border bg-state-warning-bg px-4 py-1.5 flex items-center gap-3">
      <span className="text-state-warning-fg text-[0.8461rem] mr-auto">
        {t('authError.banner')}
      </span>
      <button
        type="button"
        onClick={navigateToLogin}
        className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-medium bg-accent-claude text-white hover:bg-accent-claude-hover transition-colors"
      >
        <ArrowRightOnRectangleIcon className="w-3.5 h-3.5 rtl:-scale-x-100" />
        {t('authError.login')}
      </button>
    </div>
  );
}
