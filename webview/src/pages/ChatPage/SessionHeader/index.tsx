import { SessionDropdown } from './SessionDropdown';
import { WorkingDirDropdown } from './WorkingDirDropdown';
import { Dock } from './dock/Dock';
import { OverflowMenu } from './dock/OverflowMenu';
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

      {/* Right: the icons the user chose to keep out, then the ⋮ menu holding
          every feature. Empty by default, so a fresh install shows only ⋮ —
          which is the point: this side used to accumulate an icon per feature
          and squeeze the session title on the left. */}
      <div className="flex items-center gap-1 flex-shrink-0">
        <Dock />
        <OverflowMenu />
      </div>
    </div>
  );
}
