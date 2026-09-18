import { SettingSection } from '../../common';
import { SoundRow } from './SoundRow';
import { useTranslation } from '@/i18n';

interface Props {
  className?: string;
}

/** What a desktop notification does when it arrives. */
export const NotificationsSection = (props: Props) => {
  const { className = '' } = props;
  const { t } = useTranslation('settings');

  return (
    <div className={className}>
      <SettingSection title={t('browser.notifications.title')}>
        <SoundRow />
      </SettingSection>
    </div>
  );
};
