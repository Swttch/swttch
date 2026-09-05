import { useState, useRef, useEffect } from 'react';
import { DropdownToggle } from './DropdownToggle';
import { DropdownMenu } from './DropdownMenu';
import { useSessionContext } from '@/contexts/SessionContext';
import { useSessionList } from '@/components/SessionList/useSessionList';
import { useSessionListKeyboard } from '@/components/SessionList/useSessionListKeyboard';
import { useChatInputFocus } from '@/contexts/ChatInputFocusContext';
import { OPEN_SESSION_DROPDOWN_EVENT } from '@/commandPalette/sections/context/items';
import { isMobile } from '@/config/environment';
import { useTranslation } from '@/i18n';

export function SessionDropdown() {
  const { t } = useTranslation('chat');
  const { currentSession, switchSession, loadSessions, sessionsServiceError, isLoading } =
    useSessionContext();
  const { focus: focusComposer } = useChatInputFocus();
  const {
    currentSessionId,
    searchQuery,
    setSearchQuery,
    filteredSessions,
    groupedSessions,
    handleDeleteSession,
    renameSession,
    confirmDialog,
    loadMoreSessions,
    hasMoreSessions,
  } = useSessionList();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const sessionTitle = currentSession?.title || t('sessionHeader.sessionDropdown.pastConversations');

  const closeDropdown = () => {
    setIsOpen(false);
    setSearchQuery('');
  };

  const handleSelectSession = (sessionId: string) => {
    switchSession(sessionId);
    closeDropdown();
  };

  const { highlightedSessionId, handleSearchKeyDown } = useSessionListKeyboard({
    groupedSessions,
    searchQuery,
    isActive: isOpen,
    onSelect: handleSelectSession,
    onRefresh: loadSessions,
    onEscape: () => {
      closeDropdown();
      focusComposer();
    },
  });

  // `/resume` slash command opens the dropdown so past conversations can be
  // browsed and resumed. Issue #28.
  useEffect(() => {
    const handleOpenFromPalette = () => {
      setSearchQuery('');
      setIsOpen(true);
    };
    window.addEventListener(OPEN_SESSION_DROPDOWN_EVENT, handleOpenFromPalette);
    return () => window.removeEventListener(OPEN_SESSION_DROPDOWN_EVENT, handleOpenFromPalette);
  }, [setSearchQuery]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        closeDropdown();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen, setSearchQuery]);

  return (
    <div className={`${isMobile() ? '' : 'relative'} min-w-0`} ref={dropdownRef}>
      <DropdownToggle
        sessionTitle={sessionTitle}
        isOpen={isOpen}
        onClick={() => setIsOpen(!isOpen)}
      />

      {isOpen && (
        <DropdownMenu
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onSearchKeyDown={handleSearchKeyDown}
          groupedSessions={groupedSessions}
          filteredSessionsCount={filteredSessions.length}
          currentSessionId={currentSessionId}
          highlightedSessionId={highlightedSessionId}
          onSelectSession={handleSelectSession}
          onDeleteSession={handleDeleteSession}
          onRenameSession={renameSession}
          sessionsServiceError={sessionsServiceError}
          isLoading={isLoading}
          onLoadMore={loadMoreSessions}
          hasMore={hasMoreSessions}
        />
      )}

      {confirmDialog}
    </div>
  );
}
