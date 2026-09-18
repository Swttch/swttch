import { PermissionsSection } from './Permissions';
import { NotificationsSection } from './Notifications';
import { useTranslation } from '@/i18n';

interface Props {
  className?: string;
}

export const BrowserSettings = (props: Props) => {
  const { className = '' } = props;
  const { t } = useTranslation('settings');

  return (
    <div className={className}>
      <h2 className="text-xl font-semibold text-text-primary mb-6">{t('nav.browser')}</h2>
      <PermissionsSection />
      <NotificationsSection />
    </div>
  );
};
