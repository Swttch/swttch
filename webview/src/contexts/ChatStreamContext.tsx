import { createContext, useContext, ReactNode, useEffect, useCallback, useState, useRef, useMemo } from 'react';
import { useChatStream } from '../hooks/useChatStream';
import { useDiffs } from '../hooks/useDiffs';
import { useTools } from '../hooks/useTools';
import { useBridgeContext } from './BridgeContext';
import { useSessionContext } from './SessionContext';
import { useCliConfig } from './CliConfigContext';
import { useClaudeSettings } from './ClaudeSettingsContext';
import { LoadedMessageDto, Context, Attachment, SessionState } from '../types';
import { InputMode, InputModeValues, CLI_FLAG_TO_INPUT_MODE } from '../types/chatInput';
import { isAutoModeAvailable, reconcileSessionModel } from '../types/models';
import { MessageType, matchControlRequestCommand } from '@/shared';
import { useControlRequestCommand } from '../hooks/useControlRequestCommand';
import type { IdeSelectionPayload } from '../hooks/useIdeSelection';
import { injectIdeContext, InjectedSelectionKey } from '../hooks/ideContextTag';
import { matchesUsageCommand } from '@/commandPalette/sections/slashCommands/UsageCommand';
import { OPEN_ACCOUNT_USAGE_EVENT } from '@/commandPalette/sections/model/AccountUsageItem';

/** SEND_MESSAGE bridge payload */
interface SendMessagePayload {
  [key: string]: unknown;
  sessionId: string;
  isNewSession: boolean;
  content: string;
  attachments?: Array<Record<string, unknown>>;
  context: Context[];
  workingDir: string;
  // The mode to ask a spawning CLI for, via `--permission-mode`. Omitted when
  // nothing has established a mode for this session yet: the backend then passes
  // no flag at all, so the CLI reads its own `permissions.defaultMode`. Handing it
  // the composer's placeholder instead would override that setting, since
  // `--permission-mode default` names the ask-before-edits mode rather than
  // meaning "follow the configured default".
  inputMode?: InputMode;
  // The user-selected model, sent so the backend can spawn the CLI with
  // `--model`. This makes a model change take effect even when the previous
  // process has exited (set_model can't reach a dead process). Omitted when no
  // explicit model is selected (CLI uses its default).
  model?: string;
}

interface ChatStreamContextType {
  // From useChatStream
  messages: LoadedMessageDto[];
  isStreaming: boolean;
  streamingMessageId: string | null;
  error: Error | null;
  authDiagnosis: { envApiKeys: string[]; message: string } | null;

  // Actions
  sendMessage: (content: string, inputMode: InputMode, context?: Context[], attachments?: Attachment[]) => void;
  handleSubmit: (e: React.FormEvent | undefined, inputMode: InputMode, attachments?: Attachment[]) => void;
  /** Run a slash command the CLI only accepts as a control_request (#270). */
  runControlRequestCommand: (command: string, inputMode: InputMode) => void;
  stop: () => void;
  continue: () => void;
  retry: (messageId: string) => void;

  resetStreamState: () => void;
  // From useChatStream (message manipulation)
  clearMessages: () => void;
  loadMessages: (msgs: LoadedMessageDto[]) => void;
  prependOlderMessages: (msgs: LoadedMessageDto[]) => void;
  appendMessage: (message: LoadedMessageDto) => void;
  updateMessage: (id: string, updates: Partial<LoadedMessageDto>) => void;

  // Subsystems (preserved)
  tools: ReturnType<typeof useTools>;
  diffs: ReturnType<typeof useDiffs>;

  // Thinking block global expand/collapse state
  isThinkingExpanded: boolean;
  toggleThinkingExpanded: () => void;

  // Session lifecycle
  systemInit: Record<string, unknown> | null;
  sessionModel: string | null;
  setSessionModel: (model: string | null) => void;
  resetForSessionSwitch: () => void;

  // Context window usage
  contextWindowUsage: { totalTokens: number; contextWindow: number; maxOutputTokens: number } | null;

  // Pagination
  hasMoreOlder: boolean;
  oldestLoadedUuid: string | null;
  setPaginationState: (hasMore: boolean, oldestUuid: string | null) => void;
}

const ChatStreamContext = createContext<ChatStreamContextType | undefined>(undefined);

export function useChatStreamContext() {
  const context = useContext(ChatStreamContext);
  if (!context) {
    throw new Error('useChatStreamContext must be used within a ChatStreamProvider');
  }
  return context;
}

interface ChatStreamProviderProps {
  children: ReactNode;
  setInput: (value: string) => void;
  inputRef: React.MutableRefObject<string>;
  /**
   * Live IDE selection + include toggle, fed by IdeSelectionProvider (a sibling
   * nested below). Read inside sendMessage to prepend the IDE-context tag
   * without re-rendering this provider's consumers on every selection change.
   */
  currentSelectionRef?: React.MutableRefObject<IdeSelectionPayload | null>;
  includeSelectionRef?: React.MutableRefObject<boolean>;
  /**
   * Mirror of the native `respectGitignore` setting. Kept as a ref so sendMessage
   * stays stable across settings changes (no re-render of ChatStream consumers).
   */
  respectGitignoreRef?: React.MutableRefObject<boolean>;
}

/**
 * ChatStreamProvider receives setInput and inputRef from a sibling provider
 * (ChatInputStateProvider via ChatProviderBridge) so that it does NOT consume
 * ChatInputStateContext. This prevents every keystroke from re-rendering all
 * ChatStreamContext subscribers (e.g. MessageBubble, ChatMessageArea).
 */
export function ChatStreamProvider(props: ChatStreamProviderProps) {
  const { children, setInput, inputRef, currentSelectionRef, includeSelectionRef, respectGitignoreRef } = props;
  const bridge = useBridgeContext();
  const session = useSessionContext();
  const { controlResponse, refresh: refreshCliConfig } = useCliConfig();
  const { settings: claudeSettings } = useClaudeSettings();
  const tools = useTools();
  const diffs = useDiffs();

  const [isThinkingExpanded, setIsThinkingExpanded] = useState(false);
  const toggleThinkingExpanded = useCallback(() => setIsThinkingExpanded(prev => !prev), []);
  const [sessionModel, setSessionModel] = useState<string | null>(null);
  const [hasMoreOlder, setHasMoreOlder] = useState(false);
  const [oldestLoadedUuid, setOldestLoadedUuid] = useState<string | null>(null);

  const setPaginationState = useCallback((hasMore: boolean, oldestUuid: string | null) => {
    setHasMoreOlder(hasMore);
    setOldestLoadedUuid(oldestUuid);
  }, []);

  // EnterPlanMode 진입 전의 모드를 저장 (ExitPlanMode 시 복원용)
  const prePlanModeRef = useRef<InputMode | null>(null);
  // 마지막으로 전송한 inputMode. CLI가 통보한 실제 적용 모드와 비교해 auto 강등을 감지한다.
  const lastSentModeRef = useRef<InputMode | null>(null);

  // The IDE selection injected on the previous send, so an unchanged context is
  // not re-prepended to every consecutive message (duplicate gate).
  const lastInjectedSelectionRef = useRef<InjectedSelectionKey | null>(null);

  // Initialize useChatStream with bridge and callbacks
  const chatStream = useChatStream({
    bridge: {
      isConnected: bridge.isConnected,
      send: bridge.send,
      subscribe: bridge.subscribe,
    },
    onStreamStart: (messageId: string) => {
      console.log('[ChatStreamContext] Stream started:', messageId);
      session.setSessionState(SessionState.Streaming);
    },
    onStreamEnd: (messageId: string) => {
      console.log('[ChatStreamContext] Stream ended:', messageId);
      session.setSessionState(SessionState.Idle);
    },
    onError: (error: Error) => {
      console.error('[ChatStreamContext] Stream error:', error);
      session.setSessionState(SessionState.Error);
    },
    onSystemMessage: (data: Record<string, unknown>) => {
      console.log('[ChatStreamContext] System message:', data);
    },
    onControlRequestResult: (result) => {
      // Reloading plugins changes which slash commands and agents exist, so pull
      // the CLI config again — otherwise the palette keeps offering the old set
      // until the next spawn (#270).
      if (result.subtype === 'reload_plugins' && !result.isError) {
        refreshCliConfig().catch((error) => {
          console.error('[ChatStreamContext] Failed to refresh CLI config:', error);
        });
      }
    },
    onToolUseStart: (toolName: string) => {
      if (toolName === 'EnterPlanMode') {
        // 현재 모드가 이미 plan이 아닌 경우에만 저장
        if (session.inputMode !== InputModeValues.PLAN) {
          prePlanModeRef.current = session.inputMode;
        }
        session.setInputMode(InputModeValues.PLAN);
      }
      // ExitPlanMode는 여기서 처리하지 않음.
      // 사용자가 AcceptPlanPanel에서 승인/거부를 선택하는 시점에 ChatPanel에서 모드를 변경한다.
    },
  });

  // Destructure stable callbacks out of chatStream so downstream useCallbacks
  // don't depend on the plain-object chatStream reference (new every render).
  const {
    addUserMessage,
    addCommandEcho,
    clearMessages: chatStreamClearMessages,
    loadMessages: chatStreamLoadMessages,
    prependOlderMessages: chatStreamPrependOlderMessages,
    appendMessage: chatStreamAppendMessage,
    updateMessage: chatStreamUpdateMessage,
    resetStreamState: chatStreamResetStreamState,
    retry: chatStreamRetry,
  } = chatStream;

  // Runs the slash commands the CLI won't accept as text over stream-json (#270).
  const dispatchControlRequestCommand = useControlRequestCommand(bridge);

  // Auto mode 가용성: CLI가 모델 메타로 내려주는 supportsAutoMode + 관리자 정책
  // (disableAutoMode)로 결정한다. 모델 이름을 하드코딩하지 않는다 — 서버가 모델·버전·
  // 플랜·제공자를 종합 판정한 결과가 supportsAutoMode 한 플래그에 담겨 온다.
  const autoModeAvailable = useMemo(() => {
    const models = controlResponse?.response?.response?.models ?? [];
    // 실행 중인 모델(sessionModel, systemInit 통보)을 우선하되, 메시지 전송 전(새 세션)에는
    // 사용자가 고른 모델(claudeSettings.model)로 예측한다 — 전송 전 haiku 선택도 즉시 반영.
    const currentModel = sessionModel ?? claudeSettings.model;
    return isAutoModeAvailable(models, currentModel, claudeSettings.permissions?.disableAutoMode);
  }, [controlResponse, sessionModel, claudeSettings.model, claudeSettings.permissions?.disableAutoMode]);

  useEffect(() => {
    session.setAutoModeAvailable(autoModeAvailable);
  }, [autoModeAvailable, session.setAutoModeAvailable]);

  // systemInit이 통보한 실제 모델/권한모드를 반영한다(진실원).
  // - model: 카탈로그에서 식별되면 원본 그대로 채택한다(원본 보존). 식별하지 못하면
  //   기존 선택을 덮어쓰지 않는다 — "못 알아봤다"를 "기본값이다"로 해석하면 사용자가
  //   고른 모델이 조용히 버려진다(#217). 판단은 reconcileSessionModel이 담당.
  // - permissionMode: CLI가 실제 적용한 모드. auto를 요청했어도 미지원이면 CLI가
  //   default로 강등하고 그 결과를 여기로 통보한다. 화면 모드를 진실에 맞추고,
  //   강등이면 인풋배너로 안내한다.
  useEffect(() => {
    if (!chatStream.systemInit) return;
    const init = chatStream.systemInit as Record<string, unknown>;

    const rawModel = (init.model as string | null) ?? null;
    const catalog = controlResponse?.response?.response?.models ?? [];
    setSessionModel((prev) => reconcileSessionModel(rawModel, prev, catalog));

    const pm = init.permissionMode as string | undefined;
    const effectiveMode = pm ? CLI_FLAG_TO_INPUT_MODE[pm] : undefined;
    if (effectiveMode) {
      session.syncEffectiveMode(effectiveMode);
      if (lastSentModeRef.current === InputModeValues.AUTO && effectiveMode !== InputModeValues.AUTO) {
        session.notifyAutoFallback();
      }
    }
  }, [chatStream.systemInit, controlResponse, session.syncEffectiveMode, session.notifyAutoFallback]);

  // 모든 세션별 상태를 한 번에 리셋하는 통합 함수
  const resetForSessionSwitch = useCallback(() => {
    chatStreamClearMessages();
    chatStreamResetStreamState();
    // Restore draft input from cache (tab move/split restoration)
    let draft: string | null = null;
    try {
      draft = session.currentSessionId
        ? localStorage.getItem(`claude-gui:draft:${session.currentSessionId}`)
        : null;
    } catch {
      // localStorage may be unavailable in some environments (e.g., tests)
    }
    setInput(draft ?? '');
    setIsThinkingExpanded(false);
    setSessionModel(null);
    tools.clearToolUses();
    diffs.clearDiffs();
    prePlanModeRef.current = null;
    setHasMoreOlder(false);
    setOldestLoadedUuid(null);
  }, [chatStreamClearMessages, chatStreamResetStreamState, setInput, tools.clearToolUses, diffs.clearDiffs, session.currentSessionId]);

  // resetForSessionSwitch is called directly by SessionLoader
  // when currentSessionId changes (URL-driven reactive pattern)

  // ref로 안정화 (useEffect 의존성 churn 방지)
  const toolsRef = useRef(tools);
  const diffsRef = useRef(diffs);
  const sessionRef = useRef(session);
  toolsRef.current = tools;
  diffsRef.current = diffs;
  sessionRef.current = session;

  // Subscribe to bridge events for tools and diffs
  useEffect(() => {
    if (!bridge.isConnected) return;

    const unsubscribeToolUse = bridge.subscribe(MessageType.TOOL_USE, (message: IPCMessage) => {
      console.log('[ChatStreamContext] TOOL_USE received:', message.payload);
      toolsRef.current.addToolUse(message.payload as any);
      sessionRef.current.setSessionState(SessionState.WaitingPermission);
    });

    const unsubscribeDiff = bridge.subscribe(MessageType.DIFF_PROPOSED, (message: IPCMessage) => {
      console.log('[ChatStreamContext] DIFF_PROPOSED received:', message.payload);
      diffsRef.current.addDiff(message.payload as any);
      sessionRef.current.setSessionState(SessionState.HasDiff);
    });

    return () => {
      unsubscribeToolUse();
      unsubscribeDiff();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bridge.isConnected, bridge.subscribe]);

  // sendMessage: add to local state + send to backend (or queue if streaming)
  const sendMessage = useCallback(
    (content: string, inputMode: InputMode, context?: Context[], attachments?: Attachment[]) => {
      // Prepend the IDE-context tag (open file / selection) when the toggle is on
      // and a selection is available. parseUserContent() turns the tag back into a
      // context chip in the UI bubble, while the CLI sees the same hint. Gated on
      // slash commands and duplicate selections inside injectIdeContext.
      const { content: injectedContent, injected } = injectIdeContext({
        content,
        selection: currentSelectionRef?.current ?? null,
        // Absent ref → treat as excluded, mirroring the pre-settings chip state.
        includeSelection: includeSelectionRef?.current ?? false,
        lastInjected: lastInjectedSelectionRef.current,
        respectGitignore: respectGitignoreRef?.current ?? false,
      });
      if (injected) {
        lastInjectedSelectionRef.current = injected;
      }
      content = injectedContent;

      // Resolve session ID: use existing or generate new one
      let sessionId = session.currentSessionId;
      const isNewSession = !sessionId;
      if (!sessionId) {
        sessionId = crypto.randomUUID();
        session.addNewSession(sessionId, content);
        console.log('[ChatStreamContext] New session created:', sessionId);
      }

      // Add to local chat state (항상 — UI에는 즉시 표시)
      addUserMessage(content, context, attachments);

      // 강등 감지를 위해 이번에 요청한 모드를 기록한다(systemInit 수신 시 비교).
      lastSentModeRef.current = inputMode;

      const payload: SendMessagePayload = {
        sessionId,
        isNewSession,
        content,
        attachments: attachments?.map(a => ({ ...a.toPayload() })),
        context: context || [],
        workingDir: session.workingDirectory ?? '',
        // The mode to ask the CLI for — omitted while nothing has established one,
        // so the CLI reads its own settings instead of being handed the composer's
        // placeholder. `--permission-mode default` means "ask before edits", not
        // "follow settings", so passing it would override the user's configured
        // default with the strictest mode.
        inputMode: session.requestedInputMode ?? undefined,
        model: sessionModel ?? undefined,
      };

      // Send straight through, even mid-turn. The CLI buffers its stdin and picks
      // the message up at the next point it accepts user input, which is how the
      // terminal CLI and the VS Code extension behave. Holding it in a frontend
      // queue until `result` instead made the user wait out the whole turn (or
      // interrupt manually) before their message reached Claude (#220).
      // The backend reuses the running process, so this never respawns the CLI.
      bridge.send(MessageType.SEND_MESSAGE, payload).then((response) => {
        if (response?.status === 'error') {
          console.error('[ChatStreamContext] Backend error:', response.error);
        }
      }).catch((error) => {
        console.error('[ChatStreamContext] Failed to send message to bridge:', error);
      });
    },
    [addUserMessage, bridge, session, sessionModel]
  );

  // Run one of the slash commands the CLI won't take as text over stream-json.
  // Shared by the composer (typed) and the command palette (picked), so both
  // routes press the same button rather than drifting apart.
  const runControlRequestCommand = useCallback(
    (command: string, inputMode: InputMode) => {
      // Echo the command, but without opening an assistant turn: the CLI answers
      // a control_request with a single control_response and never sends the
      // `result` that ends a turn, so a streaming placeholder would spin forever.
      addCommandEcho(command);

      // Resolve the session the same way sendMessage does, so running a command
      // as the first action in an empty chat starts a CLI instead of finding no
      // stdin and falling back to the text the CLI refuses.
      let sessionId = session.currentSessionId;
      if (!sessionId) {
        sessionId = crypto.randomUUID();
        session.addNewSession(sessionId, command);
      }

      // Undeliverable request → send as text after all, so the user gets the
      // CLI's own answer rather than nothing at all.
      dispatchControlRequestCommand(command, {
        sessionId,
        workingDir: session.workingDirectory ?? '',
        inputMode,
        model: sessionModel ?? undefined,
      }).then((result) => {
        if (result && !result.sent) sendMessage(command, inputMode);
      });
    },
    [addCommandEcho, dispatchControlRequestCommand, sendMessage, session, sessionModel]
  );

  // handleSubmit: convenience wrapper for form submission.
  // Reads input via inputRef so this callback stays stable across keystrokes
  // — otherwise every key press would invalidate contextValue.
  const handleSubmit = useCallback(
    (e: React.FormEvent | undefined, inputMode: InputMode, attachments?: Attachment[]) => {
      if (e) e.preventDefault();
      const trimmedInput = inputRef.current.trim();
      if (!trimmedInput && (!attachments || attachments.length === 0)) return;
      // `/usage` (alone, or followed by a space and anything) opens the usage
      // modal instead of being sent to the CLI, matching the /usage slash-command
      // override. Sending it to the CLI just echoed the raw usage text back as a
      // prompt reply (issue #148). `/usageX` (no space) is a different word and
      // is sent normally.
      if (matchesUsageCommand(trimmedInput)) {
        window.dispatchEvent(new CustomEvent(OPEN_ACCOUNT_USAGE_EVENT));
        setInput('');
        return;
      }
      // `/reload-plugins` and `/btw` are missing from the CLI's command list in a
      // stream-json session and are answered with "isn't available in this
      // environment" when sent as text, so run them over the control_request the
      // CLI accepts for the same work instead (#270). Anything else — including
      // `/context` and `/usage`, which the CLI does list for us — falls through
      // to normal delivery untouched.
      if (matchControlRequestCommand(trimmedInput)) {
        runControlRequestCommand(trimmedInput, inputMode);
        setInput('');
        return;
      }
      sendMessage(trimmedInput, inputMode, undefined, attachments);
      setInput('');
    },
    [inputRef, runControlRequestCommand, sendMessage, setInput]
  );

  // stop: stdin interrupt를 백엔드에 전송.
  // CLI가 현재 턴을 중단하고, 큐잉된 메시지가 있으면 그것을 이어서 처리한다.
  // 로컬 상태(streaming, sessionState)는 CLI의 스트림 이벤트에 의해 자연스럽게 갱신된다.
  const stop = useCallback(() => {
    console.log('[ChatStreamContext] Sending interrupt to backend');

    // Send interrupt signal to backend (stdin control_request)
    bridge.send(MessageType.STOP_SESSION, {}).catch((error) => {
      console.error('[ChatStreamContext] Failed to send interrupt:', error);
    });
  }, [bridge]);

  // continue: send auto-continue message via --resume
  const continueGeneration = useCallback(() => {
    console.log('[ChatStreamContext] Continuing generation via sendMessage');

    // Auto-send continue message — triggers ensureClaudeProcess(--resume) in backend
    sendMessage('Please continue from where you left off.', sessionRef.current.inputMode);
  }, [sendMessage]);

  // retry: delegate to chatStream
  const retry = useCallback(
    (messageId: string) => {
      console.log('[ChatStreamContext] Retrying message:', messageId);
      chatStreamRetry(messageId);
    },
    [chatStreamRetry]
  );

  // Memoize contextValue so consumers don't re-render unless one of the
  // tracked dependencies actually changes. Input/setInput are no longer
  // part of this context — they live in ChatInputStateContext.
  const contextValue: ChatStreamContextType = useMemo(() => ({
    // From useChatStream
    messages: chatStream.messages,
    isStreaming: chatStream.isStreaming,
    streamingMessageId: chatStream.streamingMessageId,
    error: chatStream.error,
    authDiagnosis: chatStream.authDiagnosis,

    // Actions
    sendMessage,
    handleSubmit,
    runControlRequestCommand,
    stop,
    continue: continueGeneration,
    retry,

    resetStreamState: chatStreamResetStreamState,

    // Message manipulation
    clearMessages: chatStreamClearMessages,
    loadMessages: chatStreamLoadMessages,
    prependOlderMessages: chatStreamPrependOlderMessages,
    appendMessage: chatStreamAppendMessage,
    updateMessage: chatStreamUpdateMessage,

    // Subsystems
    tools,
    diffs,

    // Thinking block global expand/collapse state
    isThinkingExpanded,
    toggleThinkingExpanded,

    // Session lifecycle
    systemInit: chatStream.systemInit,
    sessionModel,
    setSessionModel,
    resetForSessionSwitch,

    // Context window usage
    contextWindowUsage: chatStream.contextWindowUsage,

    // Pagination
    hasMoreOlder,
    oldestLoadedUuid,
    setPaginationState,
  }), [
    chatStream.messages,
    chatStream.isStreaming,
    chatStream.streamingMessageId,
    chatStream.error,
    chatStream.authDiagnosis,
    chatStream.systemInit,
    chatStream.contextWindowUsage,
    chatStreamResetStreamState,
    chatStreamClearMessages,
    chatStreamLoadMessages,
    chatStreamPrependOlderMessages,
    chatStreamAppendMessage,
    chatStreamUpdateMessage,
    sendMessage,
    handleSubmit,
    runControlRequestCommand,
    stop,
    continueGeneration,
    retry,
    tools,
    diffs,
    isThinkingExpanded,
    toggleThinkingExpanded,
    sessionModel,
    resetForSessionSwitch,
    hasMoreOlder,
    oldestLoadedUuid,
    setPaginationState,
  ]);

  return (
    <ChatStreamContext.Provider value={contextValue}>
      {children}
    </ChatStreamContext.Provider>
  );
}
