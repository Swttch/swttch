import { useTranslation } from '@/i18n';
import { useEnvVarOriginsQuery } from '@/hooks/queries/useEnvVarOriginsQuery';
import type { EnvVarOrigin } from '@/shared';

interface Props {
  /** The CLI's own `apiKeySource` from `system/init`, e.g. "ANTHROPIC_API_KEY". */
  source: string;
}

/** i18n key for the human name of each place a variable can be set. */
const KIND_LABEL: Record<EnvVarOrigin['kind'], string> = {
  'shell-file': 'authError.credentialSource.kind.shellFile',
  'system-file': 'authError.credentialSource.kind.systemFile',
  'dotenv': 'authError.credentialSource.kind.dotenv',
  'claude-settings': 'authError.credentialSource.kind.claudeSettings',
  'plugin-settings': 'authError.credentialSource.kind.pluginSettings',
};

/**
 * Names the credential the CLI authenticated with, and where that credential is set.
 *
 * Without this, a 401 reads as "my login is broken" to someone who is plainly signed
 * in — which is exactly how issue #446 was reported. The CLI had picked up an
 * ANTHROPIC_API_KEY from the environment the IDE inherited and authenticated with
 * that instead of the login, the server rejected the key, and nothing on screen said
 * which credential had been offered.
 *
 * Two things this deliberately does NOT say.
 *
 * It does not tell the user to stop using API keys. Authenticating with a key is a
 * supported way to run the CLI, and the failure here is that THIS key was rejected,
 * not that keys are wrong. So the advice offers both repairs as equals: check the key,
 * or remove it and fall back to the login.
 *
 * It does not guess where the variable came from. The backend searches the files a
 * person actually edits and reports what it found; when it finds nothing, the notice
 * says so and lists the ways a variable arrives without living in a file.
 *
 * The name is not inferred either: it is the `apiKeySource` the CLI reports on
 * `system/init`, forwarded to the webview untouched.
 */
export function CredentialSourceNotice(props: Props) {
  const { source } = props;
  const { t } = useTranslation('chat');
  const { data: origins } = useEnvVarOriginsQuery(source);

  return (
    <div className="mt-1.5 px-3 py-2 rounded-md bg-state-pending-fg/10 border border-state-pending-border text-state-pending-fg text-xs">
      <p className="font-medium mb-1">
        {t('authError.credentialSource.title', { source })}
      </p>
      <p className="text-state-pending-fg/80">
        {t('authError.credentialSource.body', { source })}
      </p>
      <p className="text-state-pending-fg/80 mt-1">
        {t('authError.credentialSource.advice')}
      </p>

      {/* Undefined while the lookup is in flight — the notice is useful without it,
          so nothing is held back waiting for the filesystem. */}
      {origins !== undefined && (
        origins.length > 0 ? (
          <div className="mt-1.5">
            <p className="font-medium">{t('authError.credentialSource.setIn', { source })}</p>
            <ul className="list-disc list-inside">
              {origins.map((origin) => (
                <li key={`${origin.path}:${origin.line}`}>
                  <code className="bg-state-pending-fg/10 px-1 rounded">{origin.path}:{origin.line}</code>
                  <span className="text-state-pending-fg/70"> ({t(KIND_LABEL[origin.kind])})</span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-state-pending-fg/80 mt-1.5">
            {t('authError.credentialSource.notFound', { source })}
          </p>
        )
      )}
    </div>
  );
}
