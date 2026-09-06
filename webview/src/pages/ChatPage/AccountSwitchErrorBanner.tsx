import { useAutoResumeContext } from '@/contexts/AutoResumeContext';
import { useTranslation } from '@/i18n';

export function AccountSwitchErrorBanner() {
  const { accountPoolError } = useAutoResumeContext();
  const { t } = useTranslation('chat');

  if (!accountPoolError) return null;

  return (
    <div className="w-full z-20 border-t border-b border-state-warning-border bg-state-warning-bg px-4 py-1.5 flex items-center">
      <span className="text-state-warning-fg text-[0.8461rem]">
        {t('autoResume.accountPool.failedWithReason', { reason: accountPoolError })}
      </span>
    </div>
  );
}
