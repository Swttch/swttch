import { SessionDropdown } from './SessionDropdown';
import { WorkingDirDropdown } from './WorkingDirDropdown';
import { TokenBatteryButton } from './TokenBatteryButton';
import { BackgroundTasksButton } from './BackgroundTasksButton';
import { ScheduledMessagesButton } from './ScheduledMessagesButton';
import { TunnelButton } from './TunnelButton';
import { AccountSwitcher } from './AccountSwitcher';
import { SettingsButton } from './SettingsButton';
import { NewTabButton } from './NewTabButton';
import { useDocumentTitle } from '@/hooks';
import { useSessionContext } from '@/contexts/SessionContext';
import { useChatStreamContext } from '@/contexts/ChatStreamContext';
import { useNotificationSound } from '@/notifications';

export function SessionHeader() {
  const { currentSession, currentSessionId } = useSessionContext();
  const { isStreaming, error } = useChatStreamContext();
  const { selection } = useNotificationSound();
  useDocumentTitle(currentSession?.title || null, currentSessionId === null, isStreaming, selection, error);

  return (
    <div className="flex justify-between items-center px-2 py-1">
      {/* Left: Working directory dropdown + Session dropdown */}
      <div className="min-w-0 flex-1 flex items-center">
        <WorkingDirDropdown />
        <SessionDropdown />
      </div>

      {/* Right: buttons */}
      <div className="flex items-center gap-1 flex-shrink-0">
        <TokenBatteryButton />
        <ScheduledMessagesButton />
        <BackgroundTasksButton />
        <TunnelButton />
        <SettingsButton />
        <NewTabButton />
        <AccountSwitcher />
      </div>
    </div>
  );
}
