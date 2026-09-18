import { IntegrationSection } from './Integration';
import { useTranslation } from '@/i18n';

interface Props {
  className?: string;
}

/** The IDE page: a heading and the sections under it. */
export const IdeSettings = (props: Props) => {
  const { className = '' } = props;
  const { t } = useTranslation('settings');

  return (
    <div className={className}>
      <h2 className="text-xl font-semibold text-text-primary mb-6">{t('nav.ide')}</h2>

      <IntegrationSection />
    </div>
  );
};
