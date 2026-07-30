import { useState } from 'react';
import { CheckIcon, PlusIcon, Cog6ToothIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { useRouter } from '@/router/useRouter';
import { Route } from '@/router/routes';
import { useAccounts } from '@/hooks/queries/useAccounts';
import { AccountAvatar } from './AccountAvatar';
import { useTranslation } from '@/i18n';
import type { TFunction } from 'i18next';

function relativeTime(ms: number, t: TFunction): string {
  const diff = Date.now() - ms;
  const minutes = Math.floor(diff / 60_000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return t('sessionHeader.accountSwitcher.relativeTime.daysAgo', { count: days });
  if (hours > 0) return t('sessionHeader.accountSwitcher.relativeTime.hoursAgo', { count: hours });
  if (minutes > 0) return t('sessionHeader.accountSwitcher.relativeTime.minutesAgo', { count: minutes });
  return t('sessionHeader.accountSwitcher.relativeTime.justNow');
}

interface Props {
  onClose: () => void;
}

/**
 * Quick account-switch dropdown. Clicking a (non-active) row switches to that
 * account immediately. The active row shows a check and is not clickable. Footer
 * links jump to the in-app login ("Add account") or Settings → Account.
 *
 * Shares the GET_ACCOUNTS cache with the avatar button via useAccounts (same
 * query key), so this opens with the already-loaded list.
 */
export function AccountSwitcherMenu(props: Props) {
  const { onClose } = props;
  const { t } = useTranslation('chat');
  const { navigate } = useRouter();
  const { accounts, switchTo } = useAccounts();
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSwitch = async (id: string) => {
    if (switchingId) return;
    setSwitchingId(id);
    setError(null);
    const account = accounts.find((a) => a.id === id);
    try {
      await switchTo(id);
      onClose();
      const label = account?.displayName
        ? `${account.displayName}(${account.emailAddress})`
        : (account?.emailAddress ?? t('sessionHeader.accountSwitcher.fallbackAccountLabel'));
      toast.success(t('sessionHeader.accountSwitcher.switchedTo', { account: label }));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('sessionHeader.accountSwitcher.switchFailed'));
      setSwitchingId(null);
    }
  };

  const go = (route: Route) => {
    onClose();
    navigate(route);
  };

  return (
    <div className="absolute end-0 top-full mt-1 w-[20rem] bg-surface-raised border border-border-default rounded-md shadow-xl overflow-hidden z-50">
      {error && (
        <p className="text-[0.7692rem] text-state-error-fg px-3 py-2 border-b border-border-default">{error}</p>
      )}

      <div className="max-h-[18rem] overflow-y-auto py-1">
        {accounts.length === 0 ? (
          <p className="text-[0.8461rem] text-text-tertiary px-3 py-2">
            {t('sessionHeader.accountSwitcher.noSavedAccounts')}
          </p>
        ) : (
          accounts.map((account) => {
            const busy = switchingId === account.id;
            return (
              <button
                key={account.id}
                disabled={account.active || switchingId !== null}
                onClick={() => void handleSwitch(account.id)}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-start hover:bg-surface-hover disabled:cursor-default disabled:hover:bg-transparent transition-colors"
              >
                <AccountAvatar account={account} className="w-6 h-6 text-[0.6153rem] shrink-0" />
                <span className="min-w-0 flex-1 overflow-hidden">
                  <span className="block text-[0.8461rem] text-text-primary truncate leading-tight">
                    {account.displayName ?? account.emailAddress}
                  </span>
                  {account.displayName && (
                    <span className="block text-[0.7077rem] text-text-tertiary truncate leading-tight">
                      {account.emailAddress}
                    </span>
                  )}
                </span>
                <span className="shrink-0 flex items-center">
                  {account.active ? (
                    <CheckIcon className="w-4 h-4 text-state-success-fg" />
                  ) : busy ? (
                    <span className="w-4 h-4 border-2 border-border-strong border-t-text-primary rounded-full animate-spin block" />
                  ) : (
                    <span className="text-[0.7077rem] text-text-tertiary whitespace-nowrap">
                      {relativeTime(account.updatedAt, t)}
                    </span>
                  )}
                </span>
              </button>
            );
          })
        )}
      </div>

      <div className="border-t border-border-default py-1">
        <button
          onClick={() => go(Route.SWITCH_ACCOUNT)}
          className="w-full flex items-center gap-2 px-3 py-2 text-[0.8461rem] text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors"
        >
          <PlusIcon className="w-4 h-4" />
          {t('sessionHeader.accountSwitcher.addAccount')}
        </button>
        <button
          onClick={() => go(Route.SETTINGS_ACCOUNT)}
          className="w-full flex items-center gap-2 px-3 py-2 text-[0.8461rem] text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors"
        >
          <Cog6ToothIcon className="w-4 h-4" />
          {t('sessionHeader.accountSwitcher.manageAccounts')}
        </button>
      </div>
    </div>
  );
}
