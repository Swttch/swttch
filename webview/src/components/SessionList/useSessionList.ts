import { useState, useMemo, useCallback, useEffect, ReactNode } from 'react';
import { groupSessionsByDate, GroupedSessions } from './utils';
import { useSessionContext } from '@/contexts/SessionContext';
import { useConfirmDialog } from '@/components/ConfirmDialog/useConfirmDialog';
import { SessionMetaDto } from '@/dto';

interface UseSessionListResult {
  sessions: SessionMetaDto[];
  currentSessionId: string | null;
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  filteredSessions: SessionMetaDto[];
  groupedSessions: GroupedSessions;
  handleDeleteSession: (sessionId: string) => Promise<void>;
  renameSession: (sessionId: string, title: string) => Promise<void>;
  confirmDialog: ReactNode;
  /** Fetch the next page; pass to SessionList for infinite scroll. */
  loadMoreSessions: () => void;
  /** Sessions exist past the ones loaded. */
  hasMoreSessions: boolean;
}

/**
 * 세션 리스트 컨트롤 로직 (검색 필터 · 날짜 그룹핑 · 삭제 확인)을 묶은 훅.
 * 세션 드롭다운과 좌측 세션 패널이 공유한다. 세션 선택(select) 동작은
 * 호출 측마다 다르므로(드롭다운=현재 탭 전환, 패널=새 탭 열기) 이 훅에 포함하지 않는다.
 */
export function useSessionList(): UseSessionListResult {
  const {
    sessions,
    currentSessionId,
    deleteSession,
    renameSession,
    loadMoreSessions,
    loadAllSessions,
    hasMoreSessions,
  } = useSessionContext();
  const { confirmDialog, confirm } = useConfirmDialog();
  const [searchQuery, setSearchQuery] = useState('');

  // Searching filters what the client holds, so it can only be honest once the
  // client holds everything. A query that matched a session in a page never
  // fetched would otherwise report "no matching sessions" about a session that
  // exists. Paging serves the common case (pick a recent conversation); typing
  // a query is the user saying they want the rest.
  useEffect(() => {
    if (searchQuery.trim() && hasMoreSessions) {
      void loadAllSessions();
    }
  }, [searchQuery, hasMoreSessions, loadAllSessions]);

  // Filter sessions by title, session id (uuid), or the directory the session
  // belongs to, using regex with a substring-match fallback on invalid regex.
  //
  // The directory is searchable whether or not directories are currently
  // merged: typing a project name is a natural way to reach for a conversation
  // regardless of what the list happens to be showing, and it costs nothing to
  // match against a field every session already carries.
  const filteredSessions = useMemo(() => {
    if (!searchQuery.trim()) return sessions;
    const haystack = (s: SessionMetaDto) => [s.title, s.id, s.sessionDir ?? ''];
    try {
      const regex = new RegExp(searchQuery, 'i');
      return sessions.filter(s => haystack(s).some(field => regex.test(field)));
    } catch {
      const query = searchQuery.toLowerCase();
      return sessions.filter(s =>
        haystack(s).some(field => field.toLowerCase().includes(query))
      );
    }
  }, [sessions, searchQuery]);

  const groupedSessions = useMemo(() => {
    return groupSessionsByDate(filteredSessions);
  }, [filteredSessions]);

  const handleDeleteSession = useCallback(async (sessionId: string) => {
    const session = sessions.find(s => s.id === sessionId);
    const confirmed = await confirm({
      title: 'Delete Session',
      message: `Are you sure you want to delete "${session?.title ?? sessionId}"?`,
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      variant: 'danger',
    });
    if (confirmed) {
      await deleteSession(sessionId);
    }
  }, [sessions, confirm, deleteSession]);

  return {
    sessions,
    currentSessionId,
    searchQuery,
    setSearchQuery,
    filteredSessions,
    groupedSessions,
    handleDeleteSession,
    renameSession,
    confirmDialog,
    loadMoreSessions,
    // While searching, the list fetches the remainder in one request (above), so
    // the scroll-driven page loader has to stand down. Left on, the two race:
    // filtering shortens the list, which reads as "ran out of rows", and the
    // scroll loader walks to the end a page at a time while the single request
    // it was supposed to leave to loadAllSessions never gets a turn. Measured
    // doing exactly that — four paged requests where one was intended.
    hasMoreSessions: searchQuery.trim() ? false : hasMoreSessions,
  };
}
