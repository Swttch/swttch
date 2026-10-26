import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useBridgeContext } from '@/contexts/BridgeContext';
import { useChooseFolder } from '@/hooks/useChooseFolder';
import { useWorkingDir } from '@/contexts/WorkingDirContext';
import { useSessionContext } from '@/contexts/SessionContext';
import { SessionState } from '@/types';
import { classifyWorkingDirs, WorkingDirEntry } from './classifyWorkingDirs';
import { WorkingDirToggle } from './WorkingDirToggle';
import { WorkingDirMenu } from './WorkingDirMenu';
import { MessageType } from '@/shared';
import { useTranslation } from '@/i18n';
import { isMobile } from '@/config/environment';
import { useSettings } from '@/contexts/SettingsContext';
import { SettingKey } from '@/types/settings';

export function WorkingDirDropdown() {
  const { t } = useTranslation('chat');
  const { isConnected, send, subscribe } = useBridgeContext();
  const { workingDirectory, rootDir, ideRoot } = useWorkingDir();
  const { settings, updateSettingWithScope } = useSettings();
  const includeNested = settings[SettingKey.INCLUDE_NESTED_SESSIONS] ?? false;
  const { sessionState } = useSessionContext();

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

  // The tree is anchored where the user is LOOKING FROM, so opening a session
  // nested under the anchor keeps the same tree with the focus moved onto that
  // entry — rather than re-rooting on the session's own directory, which would
  // look identical to having entered that sub-project directly.
  const classified = useMemo(
    () => classifyWorkingDirs(entries, rootDir, ideRoot),
    [entries, rootDir, ideRoot],
  );

  const showOffRootIndicator =
    !!ideRoot && !!workingDirectory && ideRoot !== workingDirectory;

  const onNavigate = useCallback(() => setIsOpen(false), []);

  // Adding a working directory hands off to the host's native folder dialog and routes into
  // the folder that is chosen.
  const closeMenu = useCallback(() => setIsOpen(false), []);
  const onAddWorkingDir = useChooseFolder(closeMenu);

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
          currentPath={rootDir}
          selectedPath={workingDirectory}
          ideRoot={ideRoot}
          isLoading={isLoading && entries.length === 0}
          isRefreshing={isLoading}
          onRefresh={fetchProjects}
          includeNested={includeNested}
          onToggleIncludeNested={(next) =>
            updateSettingWithScope(SettingKey.INCLUDE_NESTED_SESSIONS, next, 'global')
          }
          onNavigate={onNavigate}
          onAddWorkingDir={onAddWorkingDir}
        />
      )}
    </div>
  );
}
