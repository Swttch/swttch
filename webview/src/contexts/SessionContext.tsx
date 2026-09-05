import { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef, ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { SessionState } from '../types';
import { SessionMetaDto } from '../dto';
import type { SessionServiceError } from '../api/modules/SessionsApi';
import { useBridgeContext } from './BridgeContext';
import { useApi } from './ApiContext';
import { useWorkingDir } from './WorkingDirContext';
import { useSettingsOrNull } from './SettingsContext';
import { SettingKey } from '@/types/settings';
import { useClaudeSettings } from './ClaudeSettingsContext';
import { getAdapter, onBridgeReady } from '../adapters';
import { getLogForwarder } from '../api/logging';
import { toTitle } from '../mappers/sessionTransformer';
import { Route, routeToPath, sessionToPath, parseSessionIdFromPath, withWorkingDir, withRootDir } from '../router/routes';
import { InputMode, getAvailableModes, resolveConfiguredInputMode, FALLBACK_INPUT_MODE } from '../types/chatInput';
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
  /**
   * The mode to ask a spawning CLI for, or null to let the CLI read its own
   * settings. Differs from `inputMode` only while nothing has established a mode
   * yet: the composer must still show something (the app fallback), but asking the
   * CLI for that fallback would override the user's configured default.
   */
  requestedInputMode: InputMode | null;
  setInputMode: (mode: InputMode) => void;
  cycleInputMode: () => void;
  /** 현재 가용한 모드 목록 (모드 선택 패널이 표시할 항목) */
  availableModes: InputMode[];
  /** CLI가 통보한 실제 적용 모드(system/init.permissionMode)를 이 세션의 모드로 반영한다. */
  syncEffectiveMode: (mode: InputMode) => void;

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
  const { subscribe, isConnected, send } = useBridgeContext();
  const { workingDirectory, setWorkingDirectory, rootDir } = useWorkingDir();
  // Reading the setting only widens the listing scope; without a provider the
  // default (off) is the correct answer, so this must not hard-require one.
  const settingsContext = useSettingsOrNull();
  const includeNested =
    settingsContext?.settings[SettingKey.INCLUDE_NESTED_SESSIONS] ?? false;
  // This setting decides WHICH directories get listed, so listing before it
  // arrives spends a whole scan on an answer that is thrown away the moment the
  // real value lands. Measured here: the discarded narrow scan cost 2273ms and
  // the widened one that replaced it 3242ms, for one screen. Waiting is not a
  // delay — the narrow result was never going to be shown.
  //
  // Absent provider means nobody will ever send a value, so there is nothing to
  // wait for and the default stands.
  const settingsPending = settingsContext?.isLoading ?? false;
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

  // 이 세션이 스스로 만들어낸 모드만 담는다 — 사용자가 직접 고른 모드, 또는 CLI가
  // 통보한 실제 적용 모드. 아직 둘 다 없으면 null이고, 그동안은 설정 기본값이 보인다.
  // 설정 기본값을 이 상태에 복사해 넣지 않는 이유: 복사하는 순간 설정 컨텍스트와의
  // 연결이 끊겨, 뒤늦게 도착한 설정을 언제 다시 반영할지 판정하는 플래그가 필요해진다.
  // 그 판정이 설정 로딩 전에 켜져 설정 기본값이 영영 반영되지 않았다(#264).
  const [sessionInputMode, setSessionInputMode] = useState<InputMode | null>(null);
  // addNewSession 시 URL 변경으로 인한 모드 리셋을 건너뛰기 위한 플래그
  const skipNextModeReset = useRef(false);

  // Auto mode 가용성/강등 안내 상태
  const [autoModeAvailable, setAutoModeAvailable] = useState(false);
  const [autoFallbackNotice, setAutoFallbackNotice] = useState(false);

  // 설정 기본값(permissions.defaultMode)은 상태가 아니라 파생값이다. 설정 컨텍스트가
  // 갱신되면 — 그것이 첫 로드든 사용자의 설정 변경이든, 언제 도착하든 — 그대로 따라온다.
  // 설정이 기본 모드를 정하지 않았거나 아직 도착하지 않았으면 null이다.
  const configuredInputMode = resolveConfiguredInputMode(claudeSettings.permissions?.defaultMode);

  // 화면에 보이는 모드. 세션이 만들어낸 값이 있으면 그것이, 없으면 설정 기본값이,
  // 그것도 없으면 앱 최후 기본값이 보인다.
  const inputMode = sessionInputMode ?? configuredInputMode ?? FALLBACK_INPUT_MODE;

  // CLI를 띄울 때 `--permission-mode`로 요구할 모드. 화면에 보이는 모드와 달리 null이
  // 될 수 있다 — 세션이 만들어낸 모드도 없고 설정에서 읽은 기본값도 없는 상태다.
  // 그때 화면은 앱 최후 기본값(ask_before_edit)을 보여주지만, 그 값을 CLI에 요구하면
  // 안 된다: `--permission-mode default`는 "설정을 따르라"가 아니라 "승인을 요구하라"는
  // 뜻이어서 설정의 defaultMode를 덮어쓴다(실측 확인). 플래그를 아예 생략해야 CLI가
  // 자기 설정 파일을 직접 읽어 GUI와 같은 값으로 돈다.
  const requestedInputMode = sessionInputMode ?? configuredInputMode;

  /**
   * A mode the USER just picked: show it, and tell the running CLI about it.
   *
   * Both halves are needed and they are not the same thing. Setting the state
   * alone changed the label and nothing else, because `--permission-mode` is a
   * spawn-time flag and the mode reached the CLI only when the next message
   * respawned it. So a mode picked while Claude was working did nothing at all
   * for the rest of that turn — the reported "auto-accept keeps asking" (#393).
   *
   * Deliberately NOT used by syncEffectiveMode: that one carries a mode the CLI
   * itself reported, and sending it back would tell the CLI what it just told
   * us. The distinction is the whole point of keeping this separate.
   *
   * Fire-and-forget. A CLI that is not running, or that refuses, leaves the
   * spawn-time path to carry the mode on the next message exactly as before, so
   * a failure here costs nothing that was not already the old behaviour.
   */
  const applyUserPickedMode = useCallback((newMode: InputMode) => {
    setSessionInputMode(newMode);
    if (!currentSessionId) return;
    void send(MessageType.SET_PERMISSION_MODE, { inputMode: newMode }).catch(() => {
      // Nothing to recover: the next message respawns under the new flag.
    });
  }, [currentSessionId, send]);

  const setInputMode = useCallback((newMode: InputMode) => {
    applyUserPickedMode(newMode);
  }, [applyUserPickedMode]);

  // 현재 가용한 모드 목록(순환·선택 패널이 공유한다).
  const availableModes = useMemo(
    () => getAvailableModes(bypassDisabled, autoModeAvailable),
    [bypassDisabled, autoModeAvailable],
  );

  const cycleInputMode = useCallback(() => {
    const currentIndex = availableModes.indexOf(inputMode);
    const nextIndex = (currentIndex + 1) % availableModes.length;
    // Same path as picking from the menu: the user chose this one too.
    applyUserPickedMode(availableModes[nextIndex]);
  }, [availableModes, inputMode, applyUserPickedMode]);

  // CLI가 통보한 실제 적용 모드를 반영한다(진실원). 사용자가 플랜 모드를 요청하지
  // 않았는데 CLI가 스스로 플랜 모드로 실행했거나, 스스로 플랜 모드를 벗어난 경우가
  // 여기로 들어온다. 세션을 다시 열 때 백엔드가 복원해주는 마지막 모드도 같은 성격이다.
  const syncEffectiveMode = useCallback((mode: InputMode) => {
    setSessionInputMode(mode);
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
    // 다른 세션으로 넘어갔으니 이전 세션이 만들어낸 모드는 더 이상 유효하지 않다.
    // 새 세션은 다시 설정 기본값에서 출발한다.
    setSessionInputMode(null);
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
  //
  // A session runs in the directory it was recorded under, which is not always
  // the one being browsed — listing nested sessions surfaces rows from below the
  // anchor. [sessionDir] carries that per-session directory; the anchor rides
  // along in `rootDir` so the list keeps its scope after the jump instead of
  // silently narrowing to wherever the opened session happens to live.
  const navigateToSession = useCallback((sessionId: string, sessionDir?: string) => {
    const dir = sessionDir ?? workingDirectory;
    const path = withWorkingDir(sessionToPath(sessionId), dir);
    navigate(withRootDir(path, rootDir, dir), { replace: isJetBrains() });
  }, [navigate, workingDirectory, rootDir]);

  // Clearing the conversation starts a new session in the SAME place the user
  // was working, so the anchor rides along too. Dropping it would silently
  // collapse the view onto the sub-project, which reads as having entered that
  // project directly and loses the wider tree the user was browsing.
  const navigateToNewSession = useCallback(() => {
    const path = withWorkingDir(routeToPath(Route.NEW_SESSION), workingDirectory);
    navigate(withRootDir(path, rootDir, workingDirectory), { replace: isJetBrains() });
  }, [navigate, workingDirectory, rootDir]);

  // loadSessions - using new API
  const loadSessions = useCallback(async () => {
    if (!isConnected) {
      console.log('[SessionContext] Not connected, cannot load sessions');
      return;
    }

    // Sessions are listed for where the user is LOOKING FROM, not for where the
    // current session happens to run. The two are the same value until a nested
    // session is opened, at which point the list must keep showing the wider
    // scope instead of narrowing to the session that was just opened.
    if (!rootDir) {
      console.log('[SessionContext] No root directory set, cannot load sessions');
      return;
    }

    // Scope is not known yet; loading now would list the wrong set of
    // directories and be redone. This effect re-runs when the setting lands.
    if (settingsPending) {
      console.log('[SessionContext] Settings not loaded yet, deferring session load');
      return;
    }

    try {
      setIsLoading(true);
      console.log('[SessionContext] Loading sessions from:', rootDir, 'nested:', includeNested);

      const result = await api.sessions.index(rootDir, includeNested);
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
  }, [isConnected, api.sessions, rootDir, includeNested, settingsPending]);

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

    const target = sessions.find(s => s.id === sessionId);
    if (target) {
      // URL change is the SSOT — SessionLoader reacts to clear state + load messages
      navigateToSession(sessionId, target.sessionDir);
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
    requestedInputMode,
    setInputMode,
    cycleInputMode,
    availableModes,
    syncEffectiveMode,
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
