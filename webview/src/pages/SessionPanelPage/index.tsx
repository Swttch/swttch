import { useState } from 'react';
import { useSessionContext } from '@/contexts/SessionContext';
import { useSessionList } from '@/components/SessionList/useSessionList';
import { useSessionListKeyboard } from '@/components/SessionList/useSessionListKeyboard';
import { SessionList } from '@/components/SessionList';
import { SearchInput } from '@/components/SessionList/SearchInput';
import { SessionListScaleProvider, SessionListScale } from '@/components/SessionList/scale';
import { getAdapter } from '@/adapters';
import { useTranslation } from '@/i18n';
import { MessageType } from '@/shared';
import { ScopeTabs, SessionScope } from './ScopeTabs';

/**
 * 좌측 세션 패널 전용 뷰 (/session-panel).
 *
 * JetBrains 좌측 툴 윈도우의 JCEF WebView가 이 라우트로 진입한다.
 * 세션 선택은 "항상 새 에디터 탭"으로 열린다(adapter.openSession 경유).
 *
 * 드롭다운과 달리 면적이 넉넉하므로 채팅영역과 동일한 일반 스케일(Regular)을 쓴다.
 */
export function SessionPanelPage() {
  const { t } = useTranslation('sessionPanel');
  const { openNewTab, loadSessions, sessionsServiceError, isLoading } = useSessionContext();
  const {
    currentSessionId,
    searchQuery,
    setSearchQuery,
    filteredSessions,
    groupedSessions,
    handleDeleteSession,
    renameSession,
    confirmDialog,
  } = useSessionList();
  const [scope, setScope] = useState<SessionScope>(SessionScope.Local);

  const handleSelectSession = (sessionId: string) => {
    getAdapter().openSession(sessionId).catch((error) => {
      console.error('[SessionPanelPage] Failed to open session:', error);
    });
  };

  // Arrow-key navigation + Enter to open + Cmd/Ctrl+Shift+P refresh, shared
  // with the session dropdown. The side panel is always visible, so there is
  // no Escape handler. Issue #28.
  const { highlightedSessionId, handleSearchKeyDown } = useSessionListKeyboard({
    groupedSessions,
    searchQuery,
    isActive: scope === SessionScope.Local,
    onSelect: handleSelectSession,
    onRefresh: loadSessions,
  });

  return (
    <SessionListScaleProvider scale={SessionListScale.Regular}>
      <div className="flex flex-col h-screen bg-surface-base text-text-primary">
        <div className="flex-shrink-0 px-2 pt-2">
          <button
            onClick={openNewTab}
            className="w-full flex items-center gap-2 px-2.5 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-surface-hover rounded transition-colors"
          >
            <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5v14M5 12h14" />
            </svg>
            {t('newSession')}
          </button>
        </div>

        <div className="flex-shrink-0 px-2 pt-1">
          <ScopeTabs scope={scope} onScopeChange={setScope} />
        </div>

        <div className="flex-shrink-0">
          <SearchInput value={searchQuery} onChange={setSearchQuery} onKeyDown={handleSearchKeyDown} />
        </div>

        {scope === SessionScope.Local ? (
          filteredSessions.length > 0 ? (
            <SessionList
              className="flex-1 min-h-0"
              groupedSessions={groupedSessions}
              currentSessionId={currentSessionId}
              highlightedSessionId={highlightedSessionId}
              onSelectSession={handleSelectSession}
              onDeleteSession={handleDeleteSession}
              onRenameSession={renameSession}
            />
          ) : (
            <div className="flex-1 px-3 py-3 text-sm text-text-tertiary text-center">
              {/* Same reasoning as the session dropdown: until a list arrives,
                  neither "no sessions" nor "no matches" is something the panel
                  knows to be true. */}
              {isLoading
                ? t('common:sessionList.loadingSessions')
                : sessionsServiceError?.type === MessageType.WSL_HOST_MISMATCH
                  ? t('empty.wslHostMismatch')
                  : searchQuery.trim()
                    ? t('empty.noMatches')
                    : t('empty.noSessions')}
            </div>
          )
        ) : (
          <div className="flex-1 px-3 py-3 text-sm text-text-tertiary text-center">
            {t('empty.noWebSessions')}
          </div>
        )}

        {confirmDialog}
      </div>
    </SessionListScaleProvider>
  );
}
