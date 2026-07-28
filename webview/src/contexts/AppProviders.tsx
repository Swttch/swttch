import { ReactNode, useCallback, useEffect, useRef } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { BridgeProvider, useBridgeContext } from './BridgeContext';
import { ApiProvider, useApiContext } from './ApiContext';
import { SessionProvider, useSessionContext } from './SessionContext';
import { ChatStreamProvider, useChatStreamContext } from './ChatStreamContext';
import { ThemeProvider } from './ThemeContext';
import { SettingsProvider, useSettings } from './SettingsContext';
import { SettingKey, NO_PAGINATION_LIMIT } from '@/types/settings';
import { ClaudeSettingsProvider, useClaudeSettings } from './ClaudeSettingsContext';
import { AuthProvider } from './AuthContext';
import { CliConfigProvider } from './CliConfigContext';
import { FableProbeProvider } from './FableProbeContext';
import { ChatInputFocusProvider } from './ChatInputFocusContext';
import { ChatInputStateProvider } from './ChatInputStateContext';
import { IdeSelectionProvider } from './IdeSelectionContext';
import type { IdeSelectionPayload } from '@/hooks/useIdeSelection';
import { WorkingDirProvider } from './WorkingDirContext';
import { WorkflowStateProvider } from './WorkflowStateContext';
import { ScheduledMessagesProvider } from './ScheduledMessagesContext';
import { AutoResumeOverrideProvider } from './AutoResumeOverrideContext';
import { CommandPaletteProvider } from '../commandPalette/CommandPaletteProvider';
import { useApi } from './ApiContext';
import { SessionState } from '../types';
import type { LoadedMessageDto } from '../types';
import { MessageType } from '@/shared';

interface AppProvidersProps {
  children: ReactNode;
}

/**
 * SessionLoader - Reactive session management driven by URL (SSOT)
 *
 * currentSessionId is derived from URL pathname in SessionContext.
 * This component reacts to currentSessionId changes and automatically:
 * 1. Clears previous session state (messages, tools, diffs)
 * 2. Loads new session messages from backend
 * 3. Guards against stale SESSION_LOADED responses
 *
 * Also handles:
 * - Loading session list on connect
 * - Reconnection recovery (isConnected false→true)
 * - Redirecting invalid session URLs
 */
function SessionLoader({ children }: { children: ReactNode }) {
  const { isConnected } = useApiContext();
  const { subscribe } = useBridgeContext();
  const api = useApi();
  const {
    loadSessions, sessions, currentSessionId, navigateToNewSession,
    isNewlyCreatedSession, setSessionState,
  } = useSessionContext();
  const { loadMessages, prependOlderMessages, setPaginationState, resetForSessionSwitch } = useChatStreamContext();
  const { settings } = useSettings();

  // Ref to track currentSessionId for SESSION_LOADED validation (avoids stale closure)
  const currentSessionIdRef = useRef<string | null>(currentSessionId);
  currentSessionIdRef.current = currentSessionId;

  // When paging is off, request a huge page so the backend returns the whole active
  // chain in one shot (hasMore=false → no "load older" UI). Default on.
  const chatPagination = settings[SettingKey.CHAT_PAGINATION] ?? true;

  // Track previous values for change detection
  const prevSessionIdRef = useRef<string | null | undefined>(undefined); // undefined = not yet initialized
  const prevConnectedRef = useRef(false);
  // The pagination value the current session was last loaded with. A change must
  // re-load the session (toggle flip, or the setting resolving after a cold
  // deep-link where it briefly read the default before the bridge value arrived).
  const prevPaginationRef = useRef(chatPagination);

  // 1. Load session list on connect
  useEffect(() => {
    if (isConnected) {
      console.log('[SessionLoader] Bridge connected, loading sessions...');
      loadSessions();
    }
  }, [isConnected, loadSessions]);

  // 2. React to currentSessionId changes OR reconnection
  //    This is the CORE reactive effect — replaces manual orchestration in switchSession/resetToNewSession
  useEffect(() => {
    if (!isConnected) {
      prevConnectedRef.current = false;
      return;
    }

    const sessionChanged = prevSessionIdRef.current !== currentSessionId;
    const reconnected = !prevConnectedRef.current && prevSessionIdRef.current !== undefined;
    const paginationChanged = prevPaginationRef.current !== chatPagination;

    prevSessionIdRef.current = currentSessionId;
    prevConnectedRef.current = true;
    prevPaginationRef.current = chatPagination;

    // Nothing to do if nothing relevant changed
    if (!sessionChanged && !reconnected && !paginationChanged) return;

    console.log('[SessionLoader] Session reaction:', {
      currentSessionId,
      sessionChanged,
      reconnected,
    });

    // Clear previous session state (messages, streaming, tools, diffs)
    // Skip reset for:
    // - Newly created sessions: first user message was just added by sendMessage
    // - Reconnections: loadMessages will overwrite; clearing first causes flicker
    if (!reconnected && !(currentSessionId && isNewlyCreatedSession(currentSessionId))) {
      resetForSessionSwitch();
    }
    setSessionState(SessionState.Idle);

    // Load session messages (skip for new/empty sessions and newly created sessions).
    // Paging off → request a huge page so the entire conversation loads at once.
    if (currentSessionId && !isNewlyCreatedSession(currentSessionId)) {
      const limit = chatPagination ? undefined : NO_PAGINATION_LIMIT;
      api.sessions.load(currentSessionId, undefined, limit);
    }
  }, [currentSessionId, isConnected, chatPagination, resetForSessionSwitch, setSessionState, api.sessions, isNewlyCreatedSession]);

  // 3. Subscribe to SESSION_LOADED — with sessionId guard against stale responses
  useEffect(() => {
    return subscribe(MessageType.SESSION_LOADED, (message) => {
      if (message.payload?.messages) {
        const rawMessages = message.payload.messages as LoadedMessageDto[];
        const sid = message.payload?.sessionId as string | undefined;
        const prepend = message.payload?.prepend as boolean | undefined;
        const hasMore = message.payload?.hasMore as boolean | undefined;
        const oldestUuid = message.payload?.oldestUuid as string | undefined;

        // Guard: ignore stale responses from previously requested sessions
        if (sid && sid !== currentSessionIdRef.current) {
          console.log('[SessionLoader] Ignoring stale SESSION_LOADED for:', sid, '(current:', currentSessionIdRef.current, ')');
          return;
        }

        // Skip empty loads for newly created sessions — their first user message
        // hasn't been written to JSONL yet, so loading would wipe local state.
        if (sid && isNewlyCreatedSession(sid) && rawMessages.length === 0) {
          console.log('[SessionLoader] Skipping empty SESSION_LOADED for newly created session:', sid);
          return;
        }

        console.log('[SessionLoader] Session loaded:', rawMessages.length, 'messages, prepend:', !!prepend, 'hasMore:', !!hasMore);
        if (prepend) {
          prependOlderMessages(rawMessages);
        } else {
          loadMessages(rawMessages);
        }
        setPaginationState(!!hasMore, oldestUuid ?? null);
      }
    });
  }, [subscribe, loadMessages, prependOlderMessages, setPaginationState, isNewlyCreatedSession]);

  // 4. Validate session exists in list — redirect bad URLs
  useEffect(() => {
    if (!currentSessionId || sessions.length === 0) return;
    if (isNewlyCreatedSession(currentSessionId)) return;

    if (!sessions.some(s => s.id === currentSessionId)) {
      console.warn('[SessionLoader] Session from URL not found, redirecting:', currentSessionId);
      navigateToNewSession();
    }
  }, [currentSessionId, sessions, isNewlyCreatedSession, navigateToNewSession]);

  return <>{children}</>;
}

/**
 * Combined provider wrapper for the entire application.
 *
 * Hierarchy:
 * 1. BridgeProvider - Kotlin IPC bridge (foundation)
 * 2. BrowserRouter - react-router path-based routing
 * 3. ApiProvider - ClaudeCodeApi initialization (depends on Bridge)
 * 4. WorkingDirProvider - Working directory management (depends on Bridge + Api)
 * 5. CliConfigProvider - CLI config (control_response) cache (depends on Bridge + WorkingDir)
 * 6. SettingsProvider - IDE settings (terminal, theme, etc.) (depends on Bridge)
 * 7. ClaudeSettingsProvider - Claude Code settings (~/.claude/settings.json) (depends on Bridge)
 * 8. SessionProvider - Session management (depends on Bridge + WorkingDir + Settings)
 * 9. ChatStreamProvider - Chat state + Streaming + Diffs + Tools (depends on Bridge + Session)
 * 10. CommandPaletteProvider - Slash command manager (depends on ChatStream + Session)
 * 11. ThemeProvider - Theme management (depends on Settings)
 * 12. SessionLoader - Reactive session management (depends on Session + ChatStream + Api)
 */

interface ChatProviderBridgeProps {
  children: ReactNode;
}

/**
 * Bridges ChatInputStateProvider and ChatStreamProvider as siblings.
 *
 * ChatStreamProvider must NOT be nested inside ChatInputStateProvider —
 * otherwise every keystroke (which triggers ChatInputStateProvider re-render)
 * would propagate into ChatStreamProvider and all its consumers
 * (MessageBubble, ChatMessageArea, etc.), causing the keystroke lag described
 * in #31.
 *
 * The shared inputRef + setInputCallbackRef let ChatStreamProvider read/clear
 * input without subscribing to ChatInputStateContext.
 */
function ChatProviderBridge(props: ChatProviderBridgeProps) {
  const { children } = props;
  const inputRef = useRef('');
  const setInputCallbackRef = useRef<(value: string) => void>(() => {});

  // Shared IDE-context refs: IdeSelectionProvider writes the live selection /
  // toggle here, ChatStreamProvider reads them inside its stable sendMessage so
  // it can prepend the context tag without re-rendering its consumers on every
  // IDE selection change. Mirrors the inputRef bridge above.
  const currentSelectionRef = useRef<IdeSelectionPayload | null>(null);
  // Starts excluded to match the chip: until IdeSelectionProvider seeds this
  // from the `attachEditorContext` setting, a send must not attach a file the
  // user may have meant to keep back (#237).
  const includeSelectionRef = useRef(false);

  // Mirror of the native `respectGitignore` setting kept as a ref so sendMessage
  // stays stable (no ChatStreamProvider re-render on settings changes).
  const respectGitignoreRef = useRef(false);
  const { settings: claudeSettings } = useClaudeSettings();
  useEffect(() => {
    respectGitignoreRef.current = claudeSettings.respectGitignore ?? false;
  }, [claudeSettings.respectGitignore]);

  const setInput = useCallback((value: string) => {
    setInputCallbackRef.current(value);
  }, []);

  return (
    <ChatStreamProvider
      setInput={setInput}
      inputRef={inputRef}
      currentSelectionRef={currentSelectionRef}
      includeSelectionRef={includeSelectionRef}
      respectGitignoreRef={respectGitignoreRef}
    >
      <ChatInputStateProvider
        inputRef={inputRef}
        setInputCallbackRef={setInputCallbackRef}
      >
        <IdeSelectionProvider
          currentSelectionRef={currentSelectionRef}
          includeSelectionRef={includeSelectionRef}
        >
          <CommandPaletteProvider>
            <ThemeProvider>
              <ChatInputFocusProvider>
                <SessionLoader>{children}</SessionLoader>
              </ChatInputFocusProvider>
            </ThemeProvider>
          </CommandPaletteProvider>
        </IdeSelectionProvider>
      </ChatInputStateProvider>
    </ChatStreamProvider>
  );
}

export function AppProviders({ children }: AppProvidersProps) {
  return (
    <BridgeProvider>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <ApiProvider>
            <WorkingDirProvider>
              <CliConfigProvider>
              <FableProbeProvider>
              <SettingsProvider>
                <ClaudeSettingsProvider>
                  <AuthProvider>
                    <SessionProvider>
                      <WorkflowStateProvider>
                        <ScheduledMessagesProvider>
                          <AutoResumeOverrideProvider>
                            <ChatProviderBridge>{children}</ChatProviderBridge>
                          </AutoResumeOverrideProvider>
                        </ScheduledMessagesProvider>
                      </WorkflowStateProvider>
                    </SessionProvider>
                  </AuthProvider>
                </ClaudeSettingsProvider>
              </SettingsProvider>
              </FableProbeProvider>
            </CliConfigProvider>
            </WorkingDirProvider>
          </ApiProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </BridgeProvider>
  );
}
