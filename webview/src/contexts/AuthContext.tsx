import { createContext, useContext, useCallback, useEffect, ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { MessageType } from '@/shared';
import { useAccountQuery } from '@/hooks/queries/useAccountQuery';

interface AuthContextValue {
  /** null = not yet determined; true/false = known login state. */
  loggedIn: boolean | null;
  /**
   * When `loggedIn` was last resolved, as epoch ms (0 while undetermined).
   *
   * Lets a consumer tell whether a login state was confirmed BEFORE or AFTER a
   * given event. A transcript's 401 entry needs exactly that: `loggedIn === true`
   * confirmed before the 401 is stale (the token was revoked since), while one
   * confirmed after it means the user has genuinely re-authenticated.
   */
  checkedAt: number;
  /** Re-query the CLI auth status (e.g. after a login completes). Awaitable so
   * callers can show a spinner while the re-check is in flight. */
  refetch: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface AuthProviderProps {
  children: ReactNode;
}

/**
 * Tracks Claude CLI login state (via `claude auth status` behind GET_ACCOUNT).
 *
 * Used to (a) gate chat entry for logged-out users and (b) auto-hide the inline
 * login CTA once the user is authenticated. Re-checks on window focus so a login
 * that completes in the browser is reflected without a manual refresh.
 *
 * Backed by the shared `useAccountQuery` so this provider and the account modal
 * share one GET_ACCOUNT request/cache instead of each fetching independently.
 */
export function AuthProvider(props: AuthProviderProps) {
  const { children } = props;
  const queryClient = useQueryClient();
  const accountQuery = useAccountQuery();

  // Derive login state from the shared query:
  // - data present  → resolved loggedIn (status='error' resolves to false)
  // - no data yet   → undetermined (null): either still pending, or a transport
  //   failure rejected with no prior success — never flip a known state on it.
  const loggedIn: boolean | null = accountQuery.data ? accountQuery.data.loggedIn : null;

  // react-query already timestamps every resolved fetch, so the "when was this
  // confirmed" question needs no extra state of our own.
  const checkedAt = accountQuery.data ? accountQuery.dataUpdatedAt : 0;

  const refetch = useCallback(async () => {
    // Invalidate both the single live-account query (login state, header avatar)
    // and the saved-accounts list (active marker, switcher) so a login/switch made
    // outside the GUI (e.g. in a terminal) is reflected on the next focus re-check.
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: [MessageType.GET_ACCOUNT] }),
      queryClient.invalidateQueries({ queryKey: [MessageType.GET_ACCOUNTS] }),
    ]);
  }, [queryClient]);

  useEffect(() => {
    // Debounce window-focus re-checks: coalesce a focus storm into at most one
    // re-check per second. react-query's in-flight dedup makes any residual
    // overlap harmless (it no longer needs the old manual single-flight guard).
    let timer: number | null = null;
    const onFocus = () => {
      if (timer !== null) return;
      timer = window.setTimeout(() => {
        timer = null;
        void refetch();
      }, 1000);
    };
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [refetch]);

  return (
    <AuthContext.Provider value={{ loggedIn, checkedAt, refetch }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthContext(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuthContext must be used within an AuthProvider');
  }
  return context;
}
