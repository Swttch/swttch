import { SettingSection } from '../../common';
import { useSessionMcp } from '@/hooks/queries/useSessionMcp';
import { useTranslation } from '@/i18n';
import { DesktopSyncRow } from './DesktopSyncRow';
import { DragDropRow } from './DragDropRow';
import { SessionMcpControl } from './SessionMcpControl';

/**
 * The session manager: the package that lets Claude start and manage other sessions, and what this app shows
 * of it. The package's version and install control sit at the right of the title; the rows below only apply
 * while it is installed, so they are dimmed rather than hidden until then.
 */
export function SessionManagerSection() {
  const { t } = useTranslation('settings');
  const { info } = useSessionMcp();
  const missing = info !== undefined && !info.installed;

  return (
    <SettingSection
      title={t('general.sessionManager.title')}
      titleAction={<SessionMcpControl />}
      description={missing ? t('general.sessionManager.required') : undefined}
      disabled={missing}
    >
      <DesktopSyncRow />
      <DragDropRow />
    </SettingSection>
  );
}
