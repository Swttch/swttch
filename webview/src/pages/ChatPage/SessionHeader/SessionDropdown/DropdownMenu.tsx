import { KeyboardEvent } from 'react';
import { GroupedSessions } from '@/components/SessionList/utils';
import { SearchInput } from '@/components/SessionList/SearchInput';
import { SessionList } from '@/components/SessionList';
import { isMobile } from '@/config/environment';
import { useTranslation } from '@/i18n';
import type { SessionServiceError } from '@/api/modules/SessionsApi';
import { MessageType } from '@/shared';

interface Props {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onSearchKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
  groupedSessions: GroupedSessions;
  filteredSessionsCount: number;
  currentSessionId: string | null;
  highlightedSessionId?: string | null;
  onSelectSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onRenameSession: (sessionId: string, title: string) => void;
  /** Non-fatal reason the backend couldn't list sessions (e.g. WSL host mismatch on win32). */
  sessionsServiceError?: SessionServiceError | null;
  /**
   * The session list is being fetched. The list loads once on connect rather
   * than when this menu opens, so opening it early used to show "no sessions
   * yet" — an answer the app did not have yet.
   */
  isLoading?: boolean;
}

export function DropdownMenu(props: Props) {
  const { t } = useTranslation('chat');
  const {
    searchQuery,
    onSearchChange,
    onSearchKeyDown,
    groupedSessions,
    filteredSessionsCount,
    currentSessionId,
    highlightedSessionId = null,
    onSelectSession,
    onDeleteSession,
    onRenameSession,
    sessionsServiceError = null,
    isLoading = false,
  } = props;

  return (
    <div className={`absolute top-full mt-1 bg-surface-raised border border-border-default rounded-md shadow-xl overflow-hidden z-50 ${isMobile() ? 'start-2 end-2' : 'start-0 w-[23rem]'}`}>
      <SearchInput value={searchQuery} onChange={onSearchChange} onKeyDown={onSearchKeyDown} />

      {filteredSessionsCount > 0 ? (
        <SessionList
          groupedSessions={groupedSessions}
          currentSessionId={currentSessionId}
          highlightedSessionId={highlightedSessionId}
          onSelectSession={onSelectSession}
          onDeleteSession={onDeleteSession}
          onRenameSession={onRenameSession}
        />
      ) : (
        <div className="px-2.5 py-3 text-xs text-text-tertiary text-center">
          {/* Loading outranks every other message here. With nothing loaded yet
              the app cannot tell "you have no sessions" from "no session matches
              this search" — both claims need a list it does not have. */}
          {isLoading
            ? t('common:sessionList.loadingSessions')
            : searchQuery.trim()
              ? t('sessionHeader.sessionDropdown.noMatchingSessions')
              : sessionsServiceError?.type === MessageType.WSL_HOST_MISMATCH
                ? t('sessionHeader.sessionDropdown.wslHostMismatch')
                : t('sessionHeader.sessionDropdown.noSessionsYet')}
        </div>
      )}
    </div>
  );
}
