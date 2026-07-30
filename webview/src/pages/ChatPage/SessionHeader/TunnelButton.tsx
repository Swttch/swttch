import { ComputerDesktopIcon } from '@heroicons/react/24/outline';
import { useTunnelStatus } from '@/hooks';
import { useTranslation } from '@/i18n';
import { useTunnelAction } from './useTunnelAction';

/**
 * Dock icon for the remote tunnel. Green while the tunnel is up.
 *
 * The modal it opens lives at the app shell (see {@link useTunnelAction}) so the
 * same item behaves identically from the ⋮ overflow menu, whose row unmounts as
 * soon as the menu closes.
 */
export function TunnelButton() {
  const { t } = useTranslation('chat');
  const { tunnelEnabled } = useTunnelStatus();
  const { handleClick } = useTunnelAction();

  return (
    <button
      onClick={handleClick}
      className="p-1 rounded transition-colors hover:bg-surface-hover"
      title={t('sessionHeader.tunnel.title')}
    >
      <ComputerDesktopIcon
        className={`w-5 h-5 ${tunnelEnabled ? 'text-state-success-fg' : 'text-text-secondary hover:text-text-primary'}`}
      />
    </button>
  );
}
