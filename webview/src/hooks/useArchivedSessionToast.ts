import { useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { i18n } from '@/i18n';
import type { SessionMetaDto } from '@/dto';
import { findArchiveChanges, type ArchivedSnapshot } from '@/utils/archiveChanges';

function say(kind: 'archived' | 'unarchived', session: SessionMetaDto): void {
  const title = session.title?.trim();
  toast(
    title
      ? i18n.t(`common:sessionList.${kind}Toast`, { title })
      : i18n.t(`common:sessionList.${kind}ToastUntitled`),
  );
}

/**
 * Say so with a toast whenever a session gets archived or is brought back, whichever way it happened: the Archive
 * conversation row, the archive button of the session list, the archived bar, the session-management MCP asked from
 * a chat, or the Claude desktop app. The change shows up in the list, so the list is the one place watched.
 */
export function useArchivedSessionToast(sessions: readonly SessionMetaDto[]): void {
  const snapshotRef = useRef<ArchivedSnapshot>(new Map());
  useEffect(() => {
    const { archived, unarchived, snapshot } = findArchiveChanges(snapshotRef.current, sessions);
    snapshotRef.current = snapshot;
    archived.forEach((session) => say('archived', session));
    unarchived.forEach((session) => say('unarchived', session));
  }, [sessions]);
}
