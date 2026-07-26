import { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef, ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { SessionState } from '../types';
import { SessionMetaDto } from '../dto';
import type { SessionServiceError } from '../api/modules/SessionsApi';
import { useBridgeContext } from './BridgeContext';
import { useApi } from './ApiContext';
import { useWorkingDir } from './WorkingDirContext';
import { useClaudeSettings } from './ClaudeSettingsContext';
import { getAdapter, onBridgeReady } from '../adapters';
import { getLogForwarder } from '../api/logging';
import { toTitle } from '../mappers/sessionTransformer';
import { Route, routeToPath, sessionToPath, parseSessionIdFromPath, withWorkingDir } from '../router/routes';
import { InputMode, getAvailableModes } from '../types/chatInput';
import {isJetBrains} from "@/config/environment.ts";
import { MessageType } from '@/shared';


interface SessionContextValue {
  // State (currentSessionId is derived from URL — single source of truth)
  currentSessionId: string | null;
  currentSession: SessionMetaDto | null;
  sessions: SessionMetaDto[];
  /** Non-fatal reason the backend couldn't list sessions (e.g. WSL host mismatch on win32). */
  sessionsServiceError: SessionServiceError | null;
  sessionState: SessionState;
  isLoading: boolean;
  workingDirectory: string | null;

  // Input mode
  inputMode: InputMode;
  setInputMode: (mode: InputMode) => void;
  cycleInputMode: () => void;
  /** 현재 가용한 모드 목록 (모드 선택 패널이 표시할 항목) */
  availableModes: InputMode[];
  /** 설정값에서 로드된 초기 모드를 동기화 (사용자가 직접 변경하지 않은 경우에만 적용) */
  syncInitialInputMode: (initialMode: InputMode) => void;
  /** CLI가 통보한 실제 적용 모드(system/init.permissionMode)를 반영. 사용자 변경 플래그는 건드리지 않는다. */
  syncEffectiveMode: (mode: InputMode) => void;
  /** 세션 전환 시 초기 모드 재동기화를 트리거하기 위한 카운터 */
  modeResetTrigger: number;

  // Auto mode availability (CLI가 결정 — ChatStream에서 푸시)
  autoModeAvailable: boolean;
  setAutoModeAvailable: (available: boolean) => void;
  /** auto 요청이 CLI에서 강등됐을 때 인풋배너로 안내할지 여부 */
  autoFallbackNotice: boolean;
  notifyAutoFallback: () => void;
  dismissAutoFallback: () => void;

  // Actions
  navigateToSession: (sessionId: string) => void;
  navigateToNewSession: () => void;
  loadSessions: () => Promise<void>;
  resetToNewSession: () => void;
  openNewTab: () => void;
  switchSession: (sessionId: string) => void;
  deleteSession: (sessionId: string) => Promise<void>;
  renameSession: (sessionId: string, title: string) => Promise<void>;
  addNewSession: (sessionId: string, firstPrompt: string) => void;
  setSessionState: (state: SessionState) => void;
  setWorkingDirectory: (dir: string | null) => void;
  /** Returns true if the session was just created locally (not restored from URL) */
  isNewlyCreatedSession: (sessionId: string) => boolean;
}

const SessionContext = createContext<SessionContextValue | null>(null);

interface SessionProviderProps {
  children: ReactNode;
}

export function SessionProvider({ children }: SessionProviderProps) {
  const { subscribe, isConnected } = useBridgeContext();
  const { workingDirectory, setWorkingDirectory } = useWorkingDir();
  const { settings: claudeSettings } = useClaudeSettings();
  const api = useApi();
  const navigate = useNavigate();
  const location = useLocation();

  const bypassDisabled = claudeSettings.permissions?.disableBypassPermissionsMode === 'disable';

  // currentSessionId is derived from URL (SSOT)
  const bg = location.state?.backgroundLocation;
  const currentSessionId = parseSessionIdFromPath(bg?.pathname ?? location.pathname);

  const [sessions, setSessions] = useState<SessionMetaDto[]>([]);
  const [sessionsServiceError, setSessionsServiceError] = useState<SessionServiceError | null>(null);
  const [sessionState, setSessionState] = useState<SessionState>(SessionState.Idle);
  const [isLoading, setIsLoading] = useState(false);
  const newlyCreatedSessionIds = useRef(new Set<string>());

  // Input mode 상태
  const [inputMode, setInputModeState] = useState<InputMode>('ask_before_edit');
  const hasUserChangedMode = useRef(false);
  // 세션 전환 시 초기 모드 재동기화를 트리거하기 위한 카운터
  const [modeResetTrigger, setModeResetTrigger] = useState(0);
  // addNewSession 시 URL 변경으로 인한 모드 리셋을 건너뛰기 위한 플래그
  const skipNextModeReset = useRef(false);

  // Auto mode 가용성/강등 안내 상태
  const [autoModeAvailable, setAutoModeAvailable] = useState(false);
  const [autoFallbackNotice, setAutoFallbackNotice] = useState(false);

  const setInputMode = useCallback((newMode: InputMode) => {
    hasUserChangedMode.current = true;
    setInputModeState(newMode);
  }, []);

  // 현재 가용한 모드 목록(순환·선택 패널이 공유한다).
  const availableModes = useMemo(
    () => getAvailableModes(bypassDisabled, autoModeAvailable),
    [bypassDisabled, autoModeAvailable],
  );

  const cycleInputMode = useCallback(() => {
    hasUserChangedMode.current = true;
    setInputModeState((current) => {
      const currentIndex = availableModes.indexOf(current);
      const nextIndex = (currentIndex + 1) % availableModes.length;
      return availableModes[nextIndex];
    });
  }, [availableModes]);

  const syncInitialInputMode = useCallback((initialMode: InputMode) => {
    if (!hasUserChangedMode.current) {
      setInputModeState(initialMode);
    }
  }, []);

  // CLI가 통보한 실제 적용 모드를 반영한다(진실원). 사용자가 무엇을 골랐는지(hasUserChangedMode)는
  // 보존하되, 화면에 보이는 모드는 CLI가 실제 적용한 것과 일치시킨다.
  const syncEffectiveMode = useCallback((mode: InputMode) => {
    setInputModeState(mode);
  }, []);

  const notifyAutoFallback = useCallback(() => setAutoFallbackNotice(true), []);
  const dismissAutoFallback = useCallback(() => setAutoFallbackNotice(false), []);

  // Reset input mode when session changes (URL-driven)
  useEffect(() => {
    // 강등 안내는 세션과 무관하게 항상 새 세션에서 초기화한다.
    setAutoFallbackNotice(false);
    if (skipNextModeReset.current) {
      skipNextModeReset.current = false;
      return;
    }
    hasUserChangedMode.current = false;
    setModeResetTrigger(c => c + 1);
  }, [currentSessionId]);

  // JetBrains에서 kotlinBridgeReady 이벤트 후 IDE adapter 재초기화
  useEffect(() => {
    const handleBridgeReady = () => {
      onBridgeReady();
    };

    window.addEventListener('kotlinBridgeReady', handleBridgeReady);
    return () => window.removeEventListener('kotlinBridgeReady', handleBridgeReady);
  }, []);

  // Navigation helpers
  const navigateToSession = useCallback((sessionId: string) => {
    navigate(withWorkingDir(sessionToPath(sessionId)), { replace: isJetBrains() });
  }, [navigate]);

  const navigateToNewSession = useCallback(() => {
    navigate(withWorkingDir(routeToPath(Route.NEW_SESSION)), { replace: isJetBrains() });
  }, [navigate]);

  // loadSessions - using new API
  const loadSessions = useCallback(async () => {
    if (!isConnected) {
      console.log('[SessionContext] Not connected, cannot load sessions');
      return;
    }

    if (!workingDirectory) {
      console.log('[SessionContext] No working directory set, cannot load sessions');
      return;
    }

    try {
      setIsLoading(true);
      console.log('[SessionContext] Loading sessions from:', workingDirectory);

      const result = await api.sessions.index(workingDirectory);
      const sessions = result.sessions
        .filter(s => !s.isSidechain)
        .sort((a, b) => {
          const aTime = a.updatedAt?.getTime() ?? 0;
          const bTime = b.updatedAt?.getTime() ?? 0;
          return bTime - aTime;
        });
      setSessions(sessions);
      setSessionsServiceError(result.serviceError ?? null);
      console.log('[SessionContext] Loaded CLI sessions:', sessions);
    } catch (error) {
      console.error('[SessionContext] Failed to load sessions:', error);
      // A transient failure must not keep showing a serviceError from a
      // previous, unrelated successful load (e.g. stale WSL host-mismatch
      // guidance after switching to a normal project).
      setSessionsServiceError(null);
    } finally {
      setIsLoading(false);
    }
  }, [isConnected, api.sessions, workingDirectory]);

  // Listen for state changes from Kotlin
  useEffect(() => {
    const unsubscribe = subscribe(MessageType.STATE_CHANGE, (message) => {
      const state = message.payload?.state as SessionState;
      if (state) {
        setSessionState(state);
      }
    });
    return unsubscribe;
  }, [subscribe]);

  // Subscribe to SESSIONS_UPDATED for cross-tab session list sync
  useEffect(() => {
    const unsubscribe = subscribe(MessageType.SESSIONS_UPDATED, (message) => {
      const { action, session } = message.payload as { action: string; session: { sessionId: string; title?: string } };
      if (action === 'rename' && session?.sessionId && session.title) {
        setSessions(prev => prev.map(s =>
          s.id === session.sessionId
            ? Object.assign(Object.create(Object.getPrototypeOf(s)), s, { title: session.title })
            : s
        ));
      } else if (action === 'upsert' && session?.sessionId) {
        setSessions(prev => {
          const exists = prev.find(s => s.id === session.sessionId);
          if (exists) {
            return prev.map(s =>
              s.id === session.sessionId
                ? { ...s, updatedAt: new Date() }
                : s
            );
          }
          // 다른 탭에서 생성된 세션 — loadSessions로 전체 갱신
          loadSessions();
          return prev;
        });
      } else if (action === 'delete' && session?.sessionId) {
        setSessions(prev => prev.filter(s => s.id !== session.sessionId));
      }
    });
    return unsubscribe;
  }, [subscribe, loadSessions]);

  const resetToNewSession = useCallback(() => {
    // URL change is the SSOT — SessionLoader reacts to clear state + reset
    navigateToNewSession();

    api.sessions.create().catch(error => {
      console.error('[SessionContext] Failed to clear CLI session:', error);
    });
  }, [api.sessions, navigateToNewSession]);

  const openNewTab = useCallback(() => {
    getAdapter().openNewTab().catch(error => {
      console.error('[SessionContext] Failed to open new tab:', error);
    });
  }, []);

  const switchSession = useCallback((sessionId: string) => {
    console.log('[SessionContext] switchSession called with:', sessionId);

    if (sessions.some(s => s.id === sessionId)) {
      // URL change is the SSOT — SessionLoader reacts to clear state + load messages
      navigateToSession(sessionId);
    } else {
      console.warn('[SessionContext] Session not found in list:', sessionId);
    }
  }, [sessions, navigateToSession]);

  const deleteSession = useCallback(async (sessionId: string) => {
    try {
      await api.sessions.destroy(sessionId, workingDirectory ?? undefined);
      setSessions(prev => prev.filter(s => s.id !== sessionId));
      if (currentSessionId === sessionId) {
        setSessionState(SessionState.Idle);
        navigateToNewSession();
      }
    } catch (error) {
      console.error('[SessionContext] Failed to delete session:', error);
    }
  }, [currentSessionId, api.sessions, navigateToNewSession, workingDirectory]);

  const renameSession = useCallback(async (sessionId: string, title: string) => {
    const trimmed = title.trim();
    if (!trimmed) return;

    // Optimistic update so the new title shows immediately; the backend
    // persists the override and broadcasts SESSIONS_UPDATED to other tabs.
    setSessions(prev => prev.map(s =>
      s.id === sessionId
        ? Object.assign(Object.create(Object.getPrototypeOf(s)), s, { title: trimmed })
        : s
    ));

    try {
      await api.sessions.rename(sessionId, trimmed, workingDirectory ?? undefined);
    } catch (error) {
      console.error('[SessionContext] Failed to rename session:', error);
    }
  }, [api.sessions, workingDirectory]);

  const addNewSession = useCallback((sessionId: string, firstPrompt: string) => {
    const now = new Date();
    const newSession = Object.assign(new SessionMetaDto(), {
      id: sessionId,
      title: toTitle(firstPrompt),
      createdAt: now,
      updatedAt: now,
      messageCount: 0,
      isSidechain: false,
    });
    newlyCreatedSessionIds.current.add(sessionId);
    setSessions(prev => [newSession, ...prev]);

    // addNewSession은 사용자가 모드를 선택한 직후 호출되므로
    // URL 변경으로 인한 모드 리셋을 건너뜀
    skipNextModeReset.current = true;
    // URL change is the SSOT — navigating IS the session creation
    navigateToSession(sessionId);
  }, [navigateToSession]);

  const isNewlyCreatedSession = useCallback((sessionId: string) => {
    return newlyCreatedSessionIds.current.has(sessionId);
  }, []);

  // LogForwarder에 현재 세션 ID 동기화
  useEffect(() => {
    getLogForwarder()?.setSessionId(currentSessionId);
  }, [currentSessionId]);

  const currentSession = useMemo(() => {
    return sessions.find(s => s.id === currentSessionId) ?? null;
  }, [sessions, currentSessionId]);

  const value: SessionContextValue = {
    currentSessionId,
    currentSession,
    sessions,
    sessionsServiceError,
    sessionState,
    isLoading,
    workingDirectory,
    inputMode,
    setInputMode,
    cycleInputMode,
    availableModes,
    syncInitialInputMode,
    syncEffectiveMode,
    modeResetTrigger,
    autoModeAvailable,
    setAutoModeAvailable,
    autoFallbackNotice,
    notifyAutoFallback,
    dismissAutoFallback,
    navigateToSession,
    navigateToNewSession,
    loadSessions,
    resetToNewSession,
    openNewTab,
    switchSession,
    deleteSession,
    renameSession,
    addNewSession,
    setSessionState,
    setWorkingDirectory,
    isNewlyCreatedSession,
  };

  return (
    <SessionContext.Provider value={value}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSessionContext() {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('useSessionContext must be used within a SessionProvider');
  }
  return context;
}
