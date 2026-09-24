import { PermissionsSection } from './Permissions';
import { useTranslation } from '@/i18n';

interface Props {
  className?: string;
}

/**
 * What this page has asked the browser for.
 *
 * Notifications used to sit here too, and no longer do: the IDE raises the same
 * desktop notifications through its own host, so the settings for them belong
 * on the General page where every user finds them (General → Notifications).
 * What is left here is the browser's own permission grants, which genuinely
 * exist only in a browser — which is also why the sidebar hides this page
 * outside one.
 */
export const BrowserSettings = (props: Props) => {
  const { className = '' } = props;
  const { t } = useTranslation('settings');

  return (
    <div className={className}>
      <h2 className="text-xl font-semibold text-text-primary mb-6">{t('nav.browser')}</h2>
      <PermissionsSection />
    </div>
  );
};
