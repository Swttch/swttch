import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBridgeContext } from '@/contexts/BridgeContext';
import { useWorkingDir } from '@/contexts/WorkingDirContext';
import { useSessionContext } from '@/contexts/SessionContext';
import { Route, routeToPath, withWorkingDir } from '@/router/routes';
import { SessionState } from '@/types';
import { classifyWorkingDirs, WorkingDirEntry } from './classifyWorkingDirs';
import { WorkingDirToggle } from './WorkingDirToggle';
import { WorkingDirMenu } from './WorkingDirMenu';
import { MessageType } from '@/shared';
import { useTranslation } from '@/i18n';
import { isMobile } from '@/config/environment';

export function WorkingDirDropdown() {
  const { t } = useTranslation('chat');
  const { isConnected, send, subscribe } = useBridgeContext();
  const { workingDirectory, ideRoot } = useWorkingDir();
  const { sessionState } = useSessionContext();
  const navigate = useNavigate();

  const [isOpen, setIsOpen] = useState(false);
  const [entries, setEntries] = useState<WorkingDirEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const isSessionActive =
    sessionState === SessionState.Streaming || sessionState === SessionState.WaitingPermission;

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Single fetch path, shared by the automatic load and the refresh button —
  // the button presses exactly what opening the menu already does, so the two
  // can never drift into fetching different things.
  const fetchProjects = useCallback(() => {
    if (!isConnected) return () => {};
    let cancelled = false;
    setIsLoading(true);
    const unsubscribe = subscribe(MessageType.PROJECTS_LIST, (message) => {
      if (cancelled) return;
      const list = (message.payload?.projects as WorkingDirEntry[]) ?? [];
      setEntries(list);
      setIsLoading(false);
      unsubscribe();
    });
    void send(MessageType.GET_PROJECTS, {});
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [isConnected, send, subscribe]);

  // Re-fetch every time the dropdown opens so a session just created in
  // another directory (or descendant tree) shows up without a manual reload.
  useEffect(() => {
    if (!isOpen) return;
    return fetchProjects();
  }, [isOpen, fetchProjects]);

  const classified = useMemo(
    () => classifyWorkingDirs(entries, workingDirectory, ideRoot),
    [entries, workingDirectory, ideRoot],
  );

  const showOffRootIndicator =
    !!ideRoot && !!workingDirectory && ideRoot !== workingDirectory;

  const onNavigate = useCallback(() => setIsOpen(false), []);

  // Adding a working directory hands off to the host's native folder dialog.
  // The bridge fires back FOLDER_SELECTED once the user picks (or cancels),
  // so we subscribe transiently and route into the new working dir.
  //
  // `setWorkingDirectory` won't help here — its routing guard only fires from
  // PROJECT_SELECTOR (or when leaving with a null dir), and we are sitting on
  // NEW_SESSION. Navigate explicitly the same way our <Link> rows do.
  const onAddWorkingDir = useCallback(() => {
    const unsubscribe = subscribe(MessageType.FOLDER_SELECTED, (message) => {
      unsubscribe();
      const selectedPath = message.payload?.path;
      if (typeof selectedPath === 'string' && selectedPath.length > 0) {
        // macOS folder dialog appends a trailing slash; strip it so the URL
        // matches sessions-index `projectPath` exactly (no slash).
        const normalized = selectedPath.replace(/\/+$/, '') || selectedPath;
        setIsOpen(false);
        navigate(withWorkingDir(routeToPath(Route.NEW_SESSION), normalized));
      }
    });
    void send(MessageType.OPEN_FOLDER_DIALOG, {});
  }, [send, subscribe, navigate]);

  // On mobile the menu anchors to the viewport edges instead of this toggle, so
  // the positioning context has to be dropped — same as SessionDropdown.
  return (
    <div className={isMobile() ? '' : 'relative'} ref={containerRef}>
      <WorkingDirToggle
        isOpen={isOpen}
        disabled={isSessionActive}
        showOffRootIndicator={showOffRootIndicator}
        title={
          isSessionActive
            ? t('sessionHeader.workingDir.switchDisabledTitle')
            : t('sessionHeader.workingDir.switchTitle')
        }
        onClick={() => setIsOpen((prev) => !prev)}
      />

      {isOpen && (
        <WorkingDirMenu
          classified={classified}
          currentPath={workingDirectory}
          ideRoot={ideRoot}
          isLoading={isLoading && entries.length === 0}
          isRefreshing={isLoading}
          onRefresh={fetchProjects}
          onNavigate={onNavigate}
          onAddWorkingDir={onAddWorkingDir}
        />
      )}
    </div>
  );
}
