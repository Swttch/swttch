import { useState } from 'react';
import { ArrowLeftIcon, ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline';
import { ROUTE_META, Label, Route } from '@/router/routes';
import { useRouter } from '@/router';
import { useLoginReturn } from '@/hooks';
import { getBridge, LOGIN_REQUEST_TIMEOUT_MS } from '@/api/bridge/Bridge';
import { getAdapter } from '@/adapters';
import { useSessionContext } from '@/contexts/SessionContext';
import { useAuthContext } from '@/contexts';
import { LoginUrlModal } from './LoginUrlModal';
import { MessageType } from '@/shared';
import { useTranslation } from '@/i18n';

interface Props {
  className?: string;
}

type LoginMethod = 'claude-ai' | 'console';

export function SwitchAccountPage(props: Props) {
  const { className } = props;
  // Back button / browser back: plain history.back — the login page was PUSHed, so
  // this returns to the session the user came from. (#178)
  const { goBack } = useRouter();
  // After a SUCCESSFUL login, go FORWARD (push) to the ?fallback= origin, else a new
  // session. Not history.back — completing login is a forward step, not a cancel.
  const returnHome = useLoginReturn();
  const { t } = useTranslation('switchAccount');
  const meta = ROUTE_META[Route.SWITCH_ACCOUNT];

  const { workingDirectory } = useSessionContext();
  const { refetch } = useAuthContext();
  const [loadingMethod, setLoadingMethod] = useState<LoginMethod | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loginUrl, setLoginUrl] = useState<string | null>(null);

  const handleLogin = async (method: LoginMethod) => {
    if (loadingMethod !== null) return;

    setLoadingMethod(method);
    setError(null);
    setLoginUrl(null);

    // The CLI prints the OAuth URL and (where it can) opens the browser itself,
    // without telling us whether that auto-open succeeded. So the backend forwards
    // the URL via LOGIN_URL_AVAILABLE rather than opening it — opening it ourselves
    // would double-open on macOS/Windows. We show it in a modal and let the user
    // open it when needed (e.g. WSL, where claude can't). (#57)
    const unsubscribeUrl = getBridge().subscribe(MessageType.LOGIN_URL_AVAILABLE, (message) => {
      const url = message.payload?.url as string | undefined;
      if (url) setLoginUrl(url);
    });

    try {
      const result = await getBridge().request<{ requestId: string; status: string; error?: string }>(
        MessageType.LOGIN,
        { method },
        { timeout: LOGIN_REQUEST_TIMEOUT_MS },
      );

      if (result?.status === 'ok') {
        // Auto-capture the just-logged-in account into the multi-account registry,
        // so signing in here also makes it switchable from Settings → Account.
        // Best-effort: a capture failure must not block navigation.
        try {
          await getBridge().request(MessageType.SAVE_ACCOUNT, {}, { timeout: LOGIN_REQUEST_TIMEOUT_MS });
        } catch (err) {
          console.error('[SwitchAccount] Failed to capture account:', err);
        }
        // Re-query auth status before returning so the account UI reflects the
        // fresh logged-in state immediately (header avatar updates, the
        // AuthErrorBanner clears) rather than lagging on the stale `false`.
        await refetch();
        returnHome();
      } else {
        setError(result?.error ?? t('errors.loginFailed'));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.loginFailed'));
    } finally {
      unsubscribeUrl();
      setLoginUrl(null);
      setLoadingMethod(null);
    }
  };

  const handleOpenLoginUrl = async () => {
    if (loginUrl === null) return;
    try {
      await getAdapter().openUrl(loginUrl);
    } catch (err) {
      console.error('[SwitchAccount] Failed to open login URL:', err);
    }
  };

  const handleSubmitCode = (code: string): void => {
    getBridge().sendRaw({
      type: MessageType.SUBMIT_LOGIN_CODE,
      payload: { code },
      timestamp: Date.now(),
    });
  };

  const handleOpenProviderDocs = async () => {
    try {
      await getAdapter().openUrl('https://code.claude.com/docs/en/vs-code#using-third-party-providers');
    } catch (err) {
      console.error('[SwitchAccount] Failed to open provider docs URL:', err);
    }
  };

  const handleOpenTerminal = async () => {
    try {
      await getAdapter().openTerminal(workingDirectory ?? '');
    } catch (err) {
      console.error('[SwitchAccount] Failed to open terminal:', err);
    }
  };

  return (
    <div className={`flex flex-col h-full bg-surface-base ${className ?? ''}`}>
      <header className="flex items-center gap-2 px-2 py-1 border-b border-border-default">
        <button
          onClick={goBack}
          className="p-1 rounded text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors"
          title={Label.BACK}
        >
          <ArrowLeftIcon className="w-4 h-4 rtl:-scale-x-100" />
        </button>
        <h1 className="text-sm font-semibold text-text-primary">{meta.label}</h1>
      </header>

      <div className="flex-1 overflow-y-auto flex items-center justify-center">
        <div className="max-w-md w-full px-8">
          <img
            src="/welcome-art-dark.svg"
            alt={t('welcomeArtAlt')}
            className="w-full mb-6"
            draggable={false}
          />

          <p className="text-sm text-text-secondary leading-relaxed">
            {t('intro')}
          </p>

          <p className="text-sm text-text-secondary mt-4">
            {t('loginPrompt')}
          </p>

          {error !== null && (
            <p className="text-xs text-state-error-fg mt-3 px-3 py-2 bg-state-error-bg border border-state-error-border rounded-lg">
              {error}
            </p>
          )}

          <button
            onClick={() => { void handleLogin('claude-ai'); }}
            disabled={loadingMethod !== null}
            className="w-full mt-6 py-3 rounded-lg bg-accent-claude hover:bg-accent-claude-hover disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold text-sm transition-colors flex items-center justify-center gap-2"
          >
            {loadingMethod === 'claude-ai' && (
              <span className="w-4 h-4 border-2 border-border-strong border-t-text-primary rounded-full animate-spin" />
            )}
            {t('claudeAi.label')}
          </button>
          <p className="text-xs text-text-tertiary mt-1.5">
            {t('claudeAi.description')}
          </p>

          <button
            onClick={() => { void handleLogin('console'); }}
            disabled={loadingMethod !== null}
            className="w-full mt-5 py-3 rounded-lg bg-surface-overlay border border-border-default hover:bg-surface-tooltip disabled:opacity-60 disabled:cursor-not-allowed text-text-primary font-semibold text-sm transition-colors flex items-center justify-center gap-2"
          >
            {loadingMethod === 'console' && (
              <span className="w-4 h-4 border-2 border-border-strong border-t-text-primary rounded-full animate-spin" />
            )}
            {t('console.label')}
          </button>
          <p className="text-xs text-text-tertiary mt-1.5">
            {t('console.description')}
          </p>

          <button
            onClick={() => { void handleOpenProviderDocs(); }}
            disabled={loadingMethod !== null}
            className="w-full mt-5 py-3 rounded-lg bg-surface-overlay border border-border-default hover:bg-surface-tooltip disabled:opacity-60 disabled:cursor-not-allowed text-text-primary font-semibold text-sm transition-colors flex items-center justify-center gap-1.5"
          >
            {t('providers.label')}
            <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5" />
          </button>
          <p className="text-xs text-text-tertiary mt-1.5">
            {t('providers.description')}
          </p>

          <p className="text-xs text-text-tertiary mt-10 text-center">
            {t('terminal.prompt')}{' '}
            <button
              onClick={() => { void handleOpenTerminal(); }}
              className="text-text-link hover:underline cursor-pointer bg-transparent border-none p-0 font-inherit text-xs"
            >
              {t('terminal.action')}
            </button>
          </p>
        </div>
      </div>

      {loginUrl !== null && (
        <LoginUrlModal
          onOpenUrl={() => { void handleOpenLoginUrl(); }}
          onSubmitCode={handleSubmitCode}
          onClose={() => setLoginUrl(null)}
        />
      )}
    </div>
  );
}
