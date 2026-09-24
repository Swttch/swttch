import { SettingSection } from '../../common';
import { SoundRow } from './SoundRow';
import { VolumeRow } from './VolumeRow';
import { BannerRow } from './BannerRow';
import { useTranslation } from '@/i18n';

interface Props {
  className?: string;
}

/**
 * How a session gets the user's attention when it finishes a turn or stops to
 * ask something.
 *
 * On the General page rather than the Browser one, because this is no longer
 * about the browser: the IDE raises the same notifications through its own
 * host, so filing them under Browser hid them from every user who works inside
 * the IDE.
 *
 * The sound is listed first even though the banner is the bigger thing on
 * screen. The two are not nested — the sound rings wherever the user is looking
 * and the banner only calls back someone who is elsewhere — and putting the
 * banner on top would read as a master switch that the sound hangs off.
 *
 * Volume sits directly under the sound because it is about that sound and
 * nothing else; between them and the banner is where the section changes
 * subject.
 */
export const NotificationsSection = (props: Props) => {
  const { className = '' } = props;
  const { t } = useTranslation('settings');

  return (
    <div className={className}>
      <SettingSection title={t('general.notifications.title')}>
        <SoundRow />
        <VolumeRow />
        <BannerRow />
      </SettingSection>
    </div>
  );
};
