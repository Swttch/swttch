import { ThemeSection } from './Theme';
import { ScrollingSection } from './Scrolling';
import { ChatSection } from './Chat';
import { useTranslation } from '@/i18n';

/** The Appearance page: a heading and the sections under it. */
export function AppearanceSettings() {
  const { t } = useTranslation('settings');

  return (
    <div>
      <h2 className="text-xl font-semibold text-text-primary mb-6">{t('appearance.title')}</h2>

      <ThemeSection />
      <ChatSection />
      <ScrollingSection />
    </div>
  );
}
