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

/**
 * Whether a click lands outside the dropdown, and so should close it.
 *
 * Exported for its own test: mounting the dropdown pulls in the session
 * context, the bridge and the whole list, none of which decides this.
 *
 * A menu opened from INSIDE the dropdown renders into `<body>` (Tippy, so the
 * session list's own overflow cannot clip it). Such a click is outside the
 * dropdown's element while still being inside the dropdown as the user sees it,
 * and closing on it shut the dropdown the moment they touched a filter.
 */
export function isClickOutsideDropdown(dropdown: Element | null, target: Node): boolean {
  if (!dropdown) return false;
  if (dropdown.contains(target)) return false;
  if (target instanceof Element && target.closest('[data-tippy-root]')) return false;
  return true;
}

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
      if (isClickOutsideDropdown(dropdownRef.current, e.target as Node)) closeDropdown();
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
