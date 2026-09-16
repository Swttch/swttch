import { useTranslation } from '@/i18n';

interface Props {
  /** The CLI's own `apiKeySource` from `system/init`, e.g. "ANTHROPIC_API_KEY". */
  source: string;
}

/**
 * Names the credential the CLI actually authenticated with, shown under an auth
 * failure entry.
 *
 * Without this, a 401 reads as "my login is broken" to someone who is plainly
 * signed in — which is exactly how issue #446 was reported. The CLI had picked up
 * an ANTHROPIC_API_KEY from the environment the IDE inherited and authenticated
 * with that instead of the login, the server rejected the key, and nothing on
 * screen said which credential had been offered.
 *
 * The name is not inferred: it is the `apiKeySource` the CLI reports on
 * `system/init`, forwarded to the webview untouched, so the notice says what the
 * CLI says rather than what we guess about the user's machine.
 */
export function CredentialSourceNotice(props: Props) {
  const { source } = props;
  const { t } = useTranslation('chat');

  return (
    <div className="mt-1.5 px-3 py-2 rounded-md bg-state-pending-fg/10 border border-state-pending-border text-state-pending-fg text-xs">
      <p className="font-medium mb-1">
        {t('authError.credentialSource.title', { source })}
      </p>
      <p className="text-state-pending-fg/80">
        {t('authError.credentialSource.hint', { source })}
      </p>
    </div>
  );
}
