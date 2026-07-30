import { useUsageData } from '@/pages/SettingsPage/Usage/useUsageData';
import { formatTimeUntil } from '@/components/AccountUsageModal/formatters';
import { useTranslation } from '@/i18n';
import { BatteryVisual } from './BatteryVisual';

interface Props {
  className?: string;
}

export function TokenBatteryButton(props: Props) {
  const { className } = props;
  const { t } = useTranslation('chat');
  const { data, isLoading, error, errorKind } = useUsageData();

  if (errorKind === 'ccb_missing') {
    const handleSetupClick = () => {
      window.dispatchEvent(new CustomEvent('open-account-usage'));
    };
    return (
      <button
        onClick={handleSetupClick}
        title={t('sessionHeader.tokenBattery.setupTitle')}
        className={`flex items-center gap-1 px-1.5 py-1 rounded transition-colors text-text-tertiary hover:text-text-primary hover:bg-surface-hover ${className ?? ''}`}
      >
        <svg width="20" height="20" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="1" y="4" width="12" height="8" rx="1.5" ry="1.5" stroke="currentColor" strokeWidth="1.2" fill="none" />
          <rect x="13" y="6.5" width="1.5" height="3" rx="0.5" ry="0.5" fill="currentColor" />
        </svg>
        <span className="text-sm">{t('sessionHeader.tokenBattery.setupLabel')}</span>
      </button>
    );
  }

  if (!data && !isLoading && error) {
    return null;
  }

  if (!data) return null;

  const remaining = 100 - (data.five_hour?.utilization ?? 0);
  const resetsAt = data.five_hour?.resets_at;
  const title = resetsAt ? formatTimeUntil(resetsAt) : undefined;

  const handleClick = () => {
    window.dispatchEvent(new CustomEvent('open-account-usage'));
  };

  return (
    <button
      onClick={handleClick}
      title={title}
      className={`flex items-center gap-1 px-1.5 py-1 rounded transition-colors text-text-secondary hover:text-text-primary hover:bg-surface-hover ${className ?? ''}`}
    >
      <BatteryVisual remaining={remaining} isLoading={isLoading} />
    </button>
  );
}
