import { useTranslation } from '@/i18n';
import { useEnvVarOriginsQuery } from '@/hooks/queries/useEnvVarOriginsQuery';
import type { EnvVarOrigin, ProxySummary } from '@/shared';

interface Props {
  proxy: ProxySummary;
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
 * Names the proxy a failed usage request went through, and where it is configured.
 *
 * A usage failure behind a proxy used to read as "network error", which sends someone
 * to check an internet connection that is working fine. The thing that refused them is
 * named in their own settings, often put there by an IT image they never edited — so
 * the panel says which hop the request takes and points at the file that decides it.
 *
 * The URL arrives with its password already masked (see the backend's ProxySummary):
 * this panel gets screenshotted into bug reports.
 */
export function ProxyNotice(props: Props) {
  const { proxy } = props;
  const { t } = useTranslation('settings');
  const { t: tChat } = useTranslation('chat');
  const { data: origins } = useEnvVarOriginsQuery(proxy.variable);

  return (
    <div className="mt-1.5 px-3 py-2 rounded-md bg-state-pending-fg/10 border border-state-pending-border text-state-pending-fg text-xs">
      <p className="font-medium">
        {t('usage.proxy.routedThrough', { url: proxy.url, variable: proxy.variable })}
      </p>

      {/* Undefined while the lookup is in flight — naming the proxy is already useful,
          so nothing is held back waiting for the filesystem. */}
      {origins !== undefined && (
        origins.length > 0 ? (
          <div className="mt-1.5">
            <p className="font-medium">{t('usage.proxy.setIn', { variable: proxy.variable })}</p>
            <ul className="list-disc list-inside">
              {origins.map((origin) => (
                <li key={`${origin.path}:${origin.line}`}>
                  <code className="bg-state-pending-fg/10 px-1 rounded">{origin.path}:{origin.line}</code>
                  <span className="text-state-pending-fg/70"> ({tChat(KIND_LABEL[origin.kind])})</span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-state-pending-fg/80 mt-1.5">
            {t('usage.proxy.notFound', { variable: proxy.variable })}
          </p>
        )
      )}
    </div>
  );
}
