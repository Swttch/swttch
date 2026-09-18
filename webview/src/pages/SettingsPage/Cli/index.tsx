import { ToolsSection } from './Tools';
import { useTranslation } from '@/i18n';

/** The CLI page: a heading and the sections under it. */
export function CliSettings() {
  const { t } = useTranslation('settings');

  return (
    <div>
      <h2 className="text-xl font-semibold text-text-primary mb-6">{t('nav.cli')}</h2>

      <ToolsSection />
    </div>
  );
}
