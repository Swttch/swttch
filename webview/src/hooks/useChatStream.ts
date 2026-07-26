import { useCallback, useState, useRef, useEffect } from 'react';
import { Context, getTextContent, LoadedMessageDto, Attachment, isImageAttachment, FileAttachment, FolderAttachment, ContextType } from '../types';
import type { TextBlockDto, ToolUseBlockDto, ThinkingBlockDto, ImageBlockDto, ImageSourceDto, AnyContentBlockDto } from '../dto/message/ContentBlockDto';
import { ContentBlockType } from '../dto/message/ContentBlockDto';
import { toInstance, LoadedMessageType, MessageRole } from '../dto/common';
import { parsePartialJson } from '../utils/parsePartialJson';
import { MessageType } from '@/shared';

/** Re-export for backwards compatibility */
export type { LoadedMessageDto as LoadedMessage } from '../types';

interface ModelUsageEntry {
  contextWindow?: number;
  maxOutputTokens?: number;
}

/**
 * Resolve modelUsage entry for the currently running model.
 * The CLI's modelUsage dict may be keyed by a form that differs slightly
 * from the `model` string in the same result event (e.g. `claude-opus-4-7`
 * vs `claude-opus-4-7[1m]`), so we try direct match, variant-suffix strip,
 * alias contains, and a single-key fallback before giving up.
 */
function pickModelUsage(
  modelUsage: Record<string, ModelUsageEntry> | null | undefined,
  model: string | null | undefined,
): ModelUsageEntry | null {
  if (!modelUsage) return null;
  if (model && modelUsage[model]) return modelUsage[model];
  if (model) {
    const stripped = model.replace(/\[.*\]$/, '');
    if (stripped !== model && modelUsage[stripped]) return modelUsage[stripped];
    const lowered = model.toLowerCase();
    for (const alias of ['opus', 'sonnet', 'haiku']) {
      if (lowered.includes(alias) && modelUsage[alias]) return modelUsage[alias];
    }
    // Last chance: any key of modelUsage that shares a common stem with model
    for (const key of Object.keys(modelUsage)) {
      if (key && (model.startsWith(key) || key.startsWith(stripped))) return modelUsage[key];
    }
  }
  const keys = Object.keys(modelUsage);
  if (keys.length === 1) return modelUsage[keys[0]];
  return null;
}

export interface UseChatStreamOptions {
  /** BridgeContext에서 가져온 bridge. subscribe/send/isConnected 포함. */
  bridge: {
    isConnected: boolean;
    send: (type: string, payload: Record<string, unknown>) => Promise<any>;
    subscribe: (type: string, handler: (message: IPCMessage) => void) => () => void;
  };
  /** 스트림 시작 시 콜백 (SessionContext 상태 변경용) */
  onStreamStart?: (messageId: string) => void;
  /** 스트림 종료 시 콜백 */
  onStreamEnd?: (messageId: string) => void;
  /** 에러 발생 시 콜백 */
  onError?: (error: Error) => void;
  /** 시스템 메시지 수신 시 콜백 */
  onSystemMessage?: (data: Record<string, unknown>) => void;
  /** tool_use 블록 시작 시 콜백 (tool name 전달) */
  onToolUseStart?: (toolName: string) => void;
}

export interface UseChatStreamReturn {
  messages: LoadedMessageDto[];
  isStreaming: boolean;
  streamingMessageId: string | null;
  error: Error | null;
  authDiagnosis: { envApiKeys: string[]; message: string } | null;

  // 로컬 메시지 조작 (전송은 하지 않음)
  addUserMessage: (content: string, context?: Context[], attachments?: Attachment[]) => void;
  clearMessages: () => void;
  loadMessages: (msgs: LoadedMessageDto[]) => void;
  prependOlderMessages: (msgs: LoadedMessageDto[]) => void;
  appendMessage: (message: LoadedMessageDto) => void;
  updateMessage: (id: string, updates: Partial<LoadedMessageDto>) => void;

  // 재시도
  retry: (messageId: string) => void;

  // 스트리밍 제어
  /** isStreaming = false 설정. bridge 전송은 ChatStreamContext가 담당. */
  stop: () => void;
  /** 스트림 관련 모든 내부 상태를 초기화 (clear conversation 등에서 사용) */
  resetStreamState: () => void;
  systemInit: Record<string, unknown> | null;
  contextWindowUsage: { totalTokens: number; contextWindow: number; maxOutputTokens: number } | null;
}



export function useChatStream(options: UseChatStreamOptions): UseChatStreamReturn {
  const { bridge, onStreamStart, onStreamEnd, onError, onSystemMessage, onToolUseStart } = options;

  const [messages, setMessages] = useState<LoadedMessageDto[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [authDiagnosis, setAuthDiagnosis] = useState<{ envApiKeys: string[]; message: string } | null>(null);
  const [systemInit, setSystemInit] = useState<Record<string, unknown> | null>(null);
  const [contextWindowUsage, setContextWindowUsage] = useState<{
    totalTokens: number;
    contextWindow: number;
    maxOutputTokens: number;
  } | null>(null);

  // RAF 스로틀링 관련 refs
  const pendingTextRef = useRef<string>('');
  const pendingThinkingRef = useRef<string>('');
  const pendingInputJsonRef = useRef<string>('');              // RAF 프레임 간 input_json_delta 축적용
  const accumulatedInputJsonRef = useRef<string>('');          // 현재 tool_use 블록의 전체 누적 input JSON 문자열
  const pendingThinkingTokensRef = useRef<number | null>(null); // system/thinking_tokens의 누적 추정치 (RAF flush에서 반영)
  const thinkingStartAtRef = useRef<number | null>(null);      // 활성 thinking 블록의 시작 시각 (duration 측정용)
  const rafIdRef = useRef<number | null>(null);
  const streamingMessageIdRef = useRef<string | null>(null); // setState 비동기 대응
  const activeBlockIndexRef = useRef<number>(-1);             // 현재 스트리밍 중인 content block의 stream index
  const activeTextBlockIndexRef = useRef<number>(-1);         // content 배열 내 현재 활성 text 블록 인덱스
  const activeThinkingBlockIndexRef = useRef<number>(-1);     // content 배열 내 현재 활성 thinking 블록 인덱스
  const activeToolUseBlockIndexRef = useRef<number>(-1);      // content 배열 내 현재 활성 tool_use 블록 인덱스
  const turnStartBlockCountRef = useRef<number>(0);           // 현재 턴 시작 시 content 배열의 길이 (병합 기준점)
  const devModeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const devModeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSkillToolUseIdRef = useRef<string | null>(null);    // Skill tool_result의 tool_use_id 추적 (isSynthetic 매칭용)
  const currentModelRef = useRef<string | null>(null);          // system/init의 model 문자열. result 이벤트엔 top-level model이 없어, modelUsage 조회 키로 이 값을 쓴다.

  // 콜백을 ref로 안정화 (useEffect 의존성 churn 방지)
  const onStreamStartRef = useRef(onStreamStart);
  const onStreamEndRef = useRef(onStreamEnd);
  const onErrorRef = useRef(onError);
  const onSystemMessageRef = useRef(onSystemMessage);
  onStreamStartRef.current = onStreamStart;
  onStreamEndRef.current = onStreamEnd;
  onErrorRef.current = onError;
  onSystemMessageRef.current = onSystemMessage;

  // Generate unique message ID
  const generateMessageId = useCallback(() => {
    return `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }, []);

  // Append a new message, inserting by timestamp order.
  // During streaming, CLI-internal messages (compact summaries, skill prompts, etc.)
  // may arrive after later messages. Timestamp-based insertion keeps correct order.
  //
  // `atEnd` opts out of that ordering for messages the user just composed here.
  // Those belong after everything on screen, but the assistant bubble already
  // streaming above them carries an earlier timestamp — so ordering by timestamp
  // would tuck a mid-turn message underneath the reply it precedes.
  const appendMessage = useCallback((message: LoadedMessageDto, atEnd = false) => {
    setMessages(prev => {
      if (atEnd) return [...prev, message];
      const ts = message.timestamp ? new Date(message.timestamp).getTime() : Infinity;
      // Fast path: most messages arrive in order (timestamp >= last message)
      const lastTs = prev.length > 0 && prev[prev.length - 1].timestamp
        ? new Date(prev[prev.length - 1].timestamp!).getTime()
        : 0;
      if (ts >= lastTs) {
        return [...prev, message];
      }
      // Out-of-order: find insertion point via binary search
      let lo = 0, hi = prev.length;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        const midTs = prev[mid].timestamp ? new Date(prev[mid].timestamp!).getTime() : 0;
        if (midTs <= ts) lo = mid + 1;
        else hi = mid;
      }
      const next = [...prev];
      next.splice(lo, 0, message);
      return next;
    });
  }, []);

  // Update an existing message
  const updateMessage = useCallback((id: string, updates: Partial<LoadedMessageDto>) => {
    setMessages(prev => prev.map(msg =>
      msg.uuid === id ? { ...msg, ...updates } : msg
    ));
  }, []);

  // RAF flush - batch update for delta accumulation
  const flushPendingDeltas = useCallback(() => {
    rafIdRef.current = null;
    const msgId = streamingMessageIdRef.current;
    if (!msgId) return;

    const textDelta = pendingTextRef.current;
    const thinkingDelta = pendingThinkingRef.current;
    const inputJsonDelta = pendingInputJsonRef.current;
    const thinkingTokens = pendingThinkingTokensRef.current;
    if (!textDelta && !thinkingDelta && !inputJsonDelta && thinkingTokens === null) return;

    pendingTextRef.current = '';
    pendingThinkingRef.current = '';
    pendingInputJsonRef.current = '';
    pendingThinkingTokensRef.current = null;

    setMessages(prev => prev.map(msg => {
      if (msg.uuid !== msgId) return msg;

      const currentBlocks: AnyContentBlockDto[] = Array.isArray(msg.message?.content)
        ? [...msg.message!.content]
        : [];

      // Append thinking delta to the active thinking block (index-based),
      // and fold in the latest live token estimate when present.
      if (thinkingDelta || thinkingTokens !== null) {
        const idx = activeThinkingBlockIndexRef.current;
        if (idx >= 0 && idx < currentBlocks.length && currentBlocks[idx].type === ContentBlockType.Thinking) {
          const block = currentBlocks[idx] as ThinkingBlockDto;
          currentBlocks[idx] = {
            ...block,
            thinking: thinkingDelta ? block.thinking + thinkingDelta : block.thinking,
            ...(thinkingTokens !== null ? { estimatedTokens: thinkingTokens } : {}),
          };
        } else if (thinkingDelta) {
          // Fallback: no active thinking block yet, create one
          currentBlocks.push({
            type: ContentBlockType.Thinking,
            thinking: thinkingDelta,
            ...(thinkingTokens !== null ? { estimatedTokens: thinkingTokens } : {}),
          } as ThinkingBlockDto);
          activeThinkingBlockIndexRef.current = currentBlocks.length - 1;
        }
      }

      // Append text delta to the active text block (index-based)
      if (textDelta) {
        const idx = activeTextBlockIndexRef.current;
        if (idx >= 0 && idx < currentBlocks.length && currentBlocks[idx].type === ContentBlockType.Text) {
          const block = currentBlocks[idx] as TextBlockDto;
          currentBlocks[idx] = { ...block, text: block.text + textDelta };
        } else {
          // Fallback: no active text block yet, create one
          currentBlocks.push({ type: ContentBlockType.Text, text: textDelta } as TextBlockDto);
          activeTextBlockIndexRef.current = currentBlocks.length - 1;
        }
      }

      // Append input JSON delta to the active tool_use block
      if (inputJsonDelta) {
        const idx = activeToolUseBlockIndexRef.current;
        if (idx >= 0 && idx < currentBlocks.length && currentBlocks[idx].type === ContentBlockType.ToolUse) {
          const block = currentBlocks[idx] as ToolUseBlockDto;
          // accumulatedInputJsonRef holds the full JSON string across all RAF frames
          accumulatedInputJsonRef.current += inputJsonDelta;
          const parsedInput = parsePartialJson(accumulatedInputJsonRef.current) ?? block.input;
          currentBlocks[idx] = { ...block, input: parsedInput };
        }
      }

      return { ...msg, message: { ...msg.message!, content: currentBlocks } };
    }));
  }, []);

  // Schedule RAF flush
  const scheduleFlush = useCallback(() => {
    if (!rafIdRef.current) {
      rafIdRef.current = requestAnimationFrame(flushPendingDeltas);
    }
  }, [flushPendingDeltas]);

  // Start streaming helper - initializes all streaming refs
  const startStreaming = useCallback((messageId: string) => {
    setIsStreaming(true);
    setStreamingMessageId(messageId);
    streamingMessageIdRef.current = messageId;
    pendingTextRef.current = '';
    pendingThinkingRef.current = '';
    pendingInputJsonRef.current = '';
    accumulatedInputJsonRef.current = '';
    pendingThinkingTokensRef.current = null;
    thinkingStartAtRef.current = null;
    activeBlockIndexRef.current = -1;
    activeTextBlockIndexRef.current = -1;
    activeThinkingBlockIndexRef.current = -1;
    activeToolUseBlockIndexRef.current = -1;
    turnStartBlockCountRef.current = 0;
    onStreamStartRef.current?.(messageId);
  }, []);

  // Ensure a streaming placeholder assistant message exists.
  // Returns the current streamingMessageId (creating one if needed).
  const ensureStreamingPlaceholder = useCallback((): string => {
    if (streamingMessageIdRef.current) {
      return streamingMessageIdRef.current;
    }
    const assistantMessageId = generateMessageId();
    const assistantMessage: LoadedMessageDto = {
      type: LoadedMessageType.Assistant,
      uuid: assistantMessageId,
      timestamp: new Date().toISOString(),
      message: { role: MessageRole.Assistant, content: [] } as LoadedMessageDto['message'],
      isStreaming: true,
    };
    // Locally created placeholder for the reply starting now — always last.
    appendMessage(assistantMessage, true);
    startStreaming(assistantMessageId);
    return assistantMessageId;
  }, [generateMessageId, appendMessage, startStreaming]);

  // End streaming helper
  const endStreaming = useCallback(() => {
    // Flush any remaining delta (including input JSON)
    if ((pendingTextRef.current || pendingThinkingRef.current || pendingInputJsonRef.current) && streamingMessageIdRef.current) {
      flushPendingDeltas();
    }
    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }

    const msgId = streamingMessageIdRef.current;
    if (msgId) {
      updateMessage(msgId, { isStreaming: false });
      onStreamEndRef.current?.(msgId);
    }

    setIsStreaming(false);
    setStreamingMessageId(null);
    streamingMessageIdRef.current = null;
    activeBlockIndexRef.current = -1;
    activeTextBlockIndexRef.current = -1;
    activeThinkingBlockIndexRef.current = -1;
    activeToolUseBlockIndexRef.current = -1;
    turnStartBlockCountRef.current = 0;
    accumulatedInputJsonRef.current = '';
  }, [flushPendingDeltas, updateMessage]);

  // addUserMessage - 로컬 상태 조작만 (bridge.send 하지 않음)
  const addUserMessage = useCallback((content: string, context?: Context[], attachments?: Attachment[]) => {
    if (!content.trim() && (!attachments || attachments.length === 0)) return;

    setError(null);
    setAuthDiagnosis(null);

    // 파일/폴더 첨부를 context로 변환
    const fileContexts: Context[] = (attachments ?? [])
      .filter(att => !isImageAttachment(att))
      .map(att => ({
        type: ContextType.File,
        path: (att as FileAttachment | FolderAttachment).absolutePath,
        content: att.displayLabel,
      }));
    const allContexts = [...(context ?? []), ...fileContexts];

    // 이미지만 ImageBlockDto로 변환
    // isContentBlockArray() type guard는 duck-typing이므로 plain object도 통과한다.
    // ImageAttachments 컴포넌트도 속성 접근만 하므로 plain object로 충분하다.
    let messageContent: string | AnyContentBlockDto[];
    const imageAttachments = (attachments ?? []).filter(isImageAttachment);
    if (imageAttachments.length > 0) {
      const blocks: AnyContentBlockDto[] = [];
      if (content.trim()) {
        blocks.push({ type: ContentBlockType.Text, text: content.trim() } as TextBlockDto);
      }
      for (const att of imageAttachments) {
        blocks.push({
          type: ContentBlockType.Image,
          source: {
            type: 'base64',
            media_type: att.mimeType,
            data: att.base64,
          } as ImageSourceDto,
        } as ImageBlockDto);
      }
      messageContent = blocks;
    } else {
      messageContent = content.trim();
    }

    // Create user message in JSONL structure
    const userMessage: LoadedMessageDto = {
      type: LoadedMessageType.User,
      uuid: generateMessageId(),
      timestamp: new Date().toISOString(),
      message: { role: MessageRole.User, content: messageContent } as any,
      context: allContexts,
    };
    appendMessage(userMessage, true);

    // 스트리밍 중이면 사용자 메시지만 추가 (assistant placeholder 생성 스킵).
    // 백엔드 전송과 큐잉은 ChatStreamContext가 담당한다.
    if (isStreaming) return;

    // Create assistant placeholder
    const assistantMessageId = generateMessageId();
    const assistantMessage: LoadedMessageDto = {
      type: LoadedMessageType.Assistant,
      uuid: assistantMessageId,
      timestamp: new Date().toISOString(),
      message: { role: MessageRole.Assistant, content: [] } as any,
      isStreaming: true,
    };
    appendMessage(assistantMessage, true);
    startStreaming(assistantMessageId);

    // Dev mode fallback
    if (!bridge.isConnected) {
      console.log('[useChatStream] Dev mode: simulating mock response');
      const mockResponse = 'This is a mock response from dev mode. Bridge not connected.';

      devModeTimeoutRef.current = setTimeout(() => {
        let charIndex = 0;
        devModeIntervalRef.current = setInterval(() => {
          if (charIndex < mockResponse.length) {
            pendingTextRef.current += mockResponse[charIndex];
            scheduleFlush();
            charIndex++;
          } else {
            if (devModeIntervalRef.current) {
              clearInterval(devModeIntervalRef.current);
              devModeIntervalRef.current = null;
            }
            endStreaming();
          }
        }, 30);
      }, 2000);
    }
  }, [isStreaming, bridge.isConnected, generateMessageId, appendMessage, startStreaming, scheduleFlush, endStreaming]);

  // Clear messages
  const clearMessages = useCallback(() => {
    setMessages([]);
    setError(null);
    setAuthDiagnosis(null);
  }, []);

  // Load messages from raw JSONL entries.
  // LoadedMessageDto's @Type/@Transform decorators handle nested transformation automatically.
  const loadMessages = useCallback((msgs: LoadedMessageDto[]) => {
    const convertedMessages = msgs
      // .filter(raw => raw.type === LoadedMessageType.User || raw.type === LoadedMessageType.Assistant)
      .map(raw => toInstance(LoadedMessageDto, raw));

    setMessages(convertedMessages);
    setError(null);
    setAuthDiagnosis(null);
    console.log('[useChatStream] Loaded messages:', convertedMessages.length);

    // 마지막 assistant 메시지에서 usage 복원
    for (let i = convertedMessages.length - 1; i >= 0; i--) {
      const msg = convertedMessages[i];
      if (msg.type === LoadedMessageType.Assistant && msg.message?.usage) {
        const usage = msg.message.usage as {
          input_tokens?: number;
          output_tokens?: number;
          cache_creation_input_tokens?: number;
          cache_read_input_tokens?: number;
        };
        if (typeof usage.input_tokens === 'number') {
          setContextWindowUsage({
            totalTokens: usage.input_tokens
              + (usage.cache_creation_input_tokens ?? 0)
              + (usage.cache_read_input_tokens ?? 0)
              + (usage.output_tokens ?? 0),
            // 세션 로드 시엔 modelUsage(result 전용)에 접근할 수 없어 실제 contextWindow를
            // 모른다. 0으로 두면 게이지는 첫 result 이후 정확한 값으로 표시된다. 임의의 200k로
            // 넣으면 1M 모델에서 5배 부풀려진 사용률을 보이므로 금지.
            contextWindow: 0,
            maxOutputTokens: 0,
          });
          break;
        }
      }
    }
  }, []);

  const prependOlderMessages = useCallback((msgs: LoadedMessageDto[]) => {
    const convertedMessages = msgs.map(raw => toInstance(LoadedMessageDto, raw));
    setMessages(prev => {
      const existingUuids = new Set(prev.map(m => m.uuid).filter(Boolean));
      const filteredNew = convertedMessages.filter(m => !m.uuid || !existingUuids.has(m.uuid));
      return [...filteredNew, ...prev];
    });
  }, []);

  // Retry
  const retry = useCallback((messageId: string) => {
    const messageIndex = messages.findIndex(m => m.uuid === messageId);
    if (messageIndex === -1) return;

    // Find the last user message before this message
    let userMessage: LoadedMessageDto | null = null;
    for (let i = messageIndex; i >= 0; i--) {
      if (messages[i].type === LoadedMessageType.User) {
        userMessage = messages[i];
        break;
      }
    }

    if (userMessage) {
      // Remove messages from the failed one onwards
      setMessages(prev => prev.slice(0, messageIndex));
      // Re-add user message and trigger send
      const content = getTextContent(userMessage);
      addUserMessage(content, userMessage.context);
      // Also send via bridge
      bridge.send(MessageType.SEND_MESSAGE, {
        content,
        context: userMessage.context || [],
      }).catch((err) => {
        console.error('[useChatStream] Error retrying message:', err);
        setError(err);
        endStreaming();
      });
    }
  }, [messages, addUserMessage, bridge, endStreaming]);

  // Stop
  const stop = useCallback(() => {
    endStreaming();
  }, [endStreaming]);

  // Reset all stream-related internal state (for clear conversation)
  const resetStreamState = useCallback(() => {
    // NOTE: systemInit is NOT reset here — it is process-level state,
    // not session-level. system/init fires only once per CLI spawn.
    setContextWindowUsage(null);
    setIsStreaming(false);
    setStreamingMessageId(null);
    streamingMessageIdRef.current = null;
    pendingTextRef.current = '';
    pendingThinkingRef.current = '';
    pendingInputJsonRef.current = '';
    accumulatedInputJsonRef.current = '';
    activeBlockIndexRef.current = -1;
    activeTextBlockIndexRef.current = -1;
    activeThinkingBlockIndexRef.current = -1;
    activeToolUseBlockIndexRef.current = -1;
    turnStartBlockCountRef.current = 0;
    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    if (devModeTimeoutRef.current) {
      clearTimeout(devModeTimeoutRef.current);
      devModeTimeoutRef.current = null;
    }
    if (devModeIntervalRef.current) {
      clearInterval(devModeIntervalRef.current);
      devModeIntervalRef.current = null;
    }
  }, []);

  // Subscribe to backend events
  useEffect(() => {
    // CLI_EVENT handler — 백엔드가 CLI 이벤트를 통합 전달
    const unsubscribeCliEvent = bridge.subscribe(MessageType.CLI_EVENT, (message) => {
      const cliEvent = message.payload as Record<string, unknown> | undefined;
      if (!cliEvent) return;

      const eventType = cliEvent.type as string | undefined;

      // ── system ──
      if (eventType === 'system') {
        if (cliEvent.subtype === 'init') {
          setSystemInit(cliEvent as Record<string, unknown>);
          // system/init은 CLI spawn당 한 번만 오며 정확한 모델 키(예: `claude-opus-4-8[1m]`)를
          // 담는다. result의 modelUsage 조회 키로 재사용한다.
          if (typeof cliEvent.model === 'string') currentModelRef.current = cliEvent.model;
        }
        // Live thinking-token estimate: the CLI emits cumulative counts on a
        // dedicated `system/thinking_tokens` event (no block index — always the
        // currently active thinking block). Stash it for the next RAF flush so
        // it lands on the same frame as the thinking text deltas.
        if (cliEvent.subtype === 'thinking_tokens') {
          const estimate = cliEvent.estimated_tokens;
          if (typeof estimate === 'number') {
            pendingThinkingTokensRef.current = estimate;
            scheduleFlush();
          }
        }
        onSystemMessageRef.current?.(cliEvent as Record<string, unknown>);
        return;
      }

      // ── stream_event ──
      if (eventType === 'stream_event') {
        const innerEvent = cliEvent.event as Record<string, unknown> | undefined;
        if (!innerEvent) return;

        const streamEventType = innerEvent.type as string | undefined;
        const delta = innerEvent.delta as Record<string, unknown> | undefined;

        // content_block_start: 새로운 content block 시작
        if (streamEventType === 'content_block_start') {
          ensureStreamingPlaceholder();

          const contentBlock = innerEvent.content_block as { type: ContentBlockType; id?: string; name?: string; text?: string; thinking?: string; input?: Record<string, unknown> } | undefined;
          const blockIndex = innerEvent.index as number | undefined;
          if (!contentBlock) return;

          if (blockIndex !== undefined) {
            activeBlockIndexRef.current = blockIndex;
          }

          // content 배열에 새 블록을 push하고 활성 인덱스를 기록
          setMessages(prev => prev.map(msg => {
            if (msg.uuid !== streamingMessageIdRef.current) return msg;

            const currentBlocks: AnyContentBlockDto[] = Array.isArray(msg.message?.content)
              ? [...msg.message!.content]
              : [];

            if (contentBlock.type === ContentBlockType.Text) {
              const newBlock: TextBlockDto = { type: ContentBlockType.Text, text: contentBlock.text ?? '' } as TextBlockDto;
              currentBlocks.push(newBlock);
              activeTextBlockIndexRef.current = currentBlocks.length - 1;
            } else if (contentBlock.type === ContentBlockType.ToolUse) {
              const newBlock: ToolUseBlockDto = {
                type: ContentBlockType.ToolUse,
                id: contentBlock.id ?? '',
                name: contentBlock.name ?? '',
                input: contentBlock.input ?? {},
              } as ToolUseBlockDto;
              currentBlocks.push(newBlock);
              activeToolUseBlockIndexRef.current = currentBlocks.length - 1;
              // Reset accumulated input JSON for new tool_use block
              accumulatedInputJsonRef.current = '';
              // Notify tool_use start (for Plan Mode detection etc.)
              if (contentBlock.name) {
                onToolUseStart?.(contentBlock.name);
              }
            } else if (contentBlock.type === ContentBlockType.Thinking) {
              const newBlock: ThinkingBlockDto = { type: ContentBlockType.Thinking, thinking: contentBlock.thinking ?? '' } as ThinkingBlockDto;
              currentBlocks.push(newBlock);
              activeThinkingBlockIndexRef.current = currentBlocks.length - 1;
              // Mark the start so we can report "Thought for Ns" when the block stops.
              thinkingStartAtRef.current = Date.now();
            }

            return { ...msg, message: { ...msg.message!, content: currentBlocks } };
          }));
          return;
        }

        // content_block_stop: 현재 블록 종료
        if (streamEventType === 'content_block_stop') {
          activeBlockIndexRef.current = -1;
          // Flush any remaining delta for the completed block
          if (pendingTextRef.current || pendingThinkingRef.current || pendingInputJsonRef.current || pendingThinkingTokensRef.current !== null) {
            flushPendingDeltas();
          }
          // Stamp the thinking block's duration once it closes. We key off
          // thinkingStartAtRef (set at the thinking content_block_start) rather
          // than activeThinkingBlockIndexRef, because the `assistant` event
          // arrives *before* this content_block_stop and resets the index ref —
          // so we instead find the latest not-yet-stamped thinking block.
          const startedAt = thinkingStartAtRef.current;
          if (startedAt !== null) {
            const durationMillis = Date.now() - startedAt;
            const msgId = streamingMessageIdRef.current;
            thinkingStartAtRef.current = null;
            activeThinkingBlockIndexRef.current = -1;
            if (msgId) {
              setMessages(prev => prev.map(msg => {
                if (msg.uuid !== msgId) return msg;
                const blocks = Array.isArray(msg.message?.content) ? [...msg.message!.content] : [];
                for (let i = blocks.length - 1; i >= 0; i--) {
                  const block = blocks[i];
                  if (block.type === ContentBlockType.Thinking && (block as ThinkingBlockDto).durationMillis === undefined) {
                    blocks[i] = { ...(block as ThinkingBlockDto), durationMillis };
                    return { ...msg, message: { ...msg.message!, content: blocks } };
                  }
                }
                return msg;
              }));
            }
          }
          return;
        }

        // content_block_delta 처리
        if (!delta) return;

        // text_delta 처리
        if (delta.type === 'text_delta' && delta.text) {
          ensureStreamingPlaceholder();
          pendingTextRef.current += delta.text as string;
          scheduleFlush();
        }

        // thinking_delta 처리
        if (delta.type === 'thinking_delta' && delta.thinking) {
          ensureStreamingPlaceholder();
          pendingThinkingRef.current += delta.thinking as string;
          scheduleFlush();
        }

        // input_json_delta 처리 (tool_use의 input 축적)
        if (delta.type === 'input_json_delta' && typeof delta.partial_json === 'string') {
          ensureStreamingPlaceholder();
          pendingInputJsonRef.current += delta.partial_json;
          scheduleFlush();
        }

        // tool_use_delta 처리 (일부 백엔드에서 이 타입으로 올 수 있음)
        if (delta.type === 'tool_use_delta') {
          if (typeof delta.partial_json === 'string') {
            ensureStreamingPlaceholder();
            pendingInputJsonRef.current += delta.partial_json;
            scheduleFlush();
          }
        }
        return;
      }

      // ── assistant ──
      // 에이전트 루프에서 각 턴마다 해당 턴의 content만 포함하여 발생.
      // 이전 턴의 블록을 보존하면서 현재 턴의 스트리밍 블록을 최종 버전으로 교체.
      if (eventType === 'assistant') {
        // Sub-agent assistant events → progress로 변환 (히스토리 로드와 동일한 형태)
        if ((cliEvent as any).parent_tool_use_id) {
          const progressEntry: LoadedMessageDto = {
            type: LoadedMessageType.Progress,
            uuid: (cliEvent as any).uuid || generateMessageId(),
            parentToolUseID: (cliEvent as any).parent_tool_use_id as string,
            data: {
              type: 'agent_progress',
              message: {
                type: 'assistant',
                message: cliEvent.message as any,
                uuid: (cliEvent as any).uuid,
                timestamp: (cliEvent as any).timestamp,
              },
            },
            timestamp: (cliEvent as any).timestamp ?? new Date().toISOString(),
          };
          appendMessage(progressEntry);
          return;
        }

        const assistantMessage = cliEvent.message as Record<string, unknown> | undefined;
        if (!assistantMessage) return;

        // Preserve top-level API-error metadata. Auth failures arrive as a
        // synthetic assistant entry carrying isApiErrorMessage/apiErrorStatus/error
        // (not inside `message`), which the renderer uses to show a login CTA.
        const apiErrorFields = {
          isApiErrorMessage: cliEvent.isApiErrorMessage as boolean | undefined,
          apiErrorStatus: cliEvent.apiErrorStatus as number | undefined,
          error: cliEvent.error as string | undefined,
        };

        const messageId = assistantMessage.id as string;
        const incomingContent = assistantMessage.content;
        const assistantUsage = assistantMessage.usage as {
          input_tokens?: number;
          output_tokens?: number;
          cache_creation_input_tokens?: number;
          cache_read_input_tokens?: number;
        } | null;
        if (assistantUsage && typeof assistantUsage.input_tokens === 'number') {
          setContextWindowUsage(prev => ({
            totalTokens: assistantUsage.input_tokens!
              + (assistantUsage.cache_creation_input_tokens ?? 0)
              + (assistantUsage.cache_read_input_tokens ?? 0)
              + (assistantUsage.output_tokens ?? 0),
            contextWindow: prev?.contextWindow ?? 0,
            maxOutputTokens: prev?.maxOutputTokens ?? 0,
          }));
        }

        if (!incomingContent || !Array.isArray(incomingContent)) return;
        const finalTurnBlocks = incomingContent as AnyContentBlockDto[];

        // Capture the streaming placeholder id BEFORE calling setMessages. React may
        // flush the updater callback after this handler returns, and for local slash
        // commands like /context — where `assistant` and `result` arrive back-to-back
        // with no partial stream_events — result's endStreaming() nulls
        // streamingMessageIdRef.current in between. Reading the ref inside the callback
        // would then match nothing and drop the finished content (#196).
        const streamingId = streamingMessageIdRef.current;
        if (streamingId) {
          // Flush any pending deltas before replacing
          if (pendingTextRef.current || pendingThinkingRef.current || pendingInputJsonRef.current) {
            flushPendingDeltas();
          }

          // Replace current turn's streaming blocks with final blocks.
          // Blocks before turnStartBlockCountRef are from previous turns and must be preserved.
          const turnStart = turnStartBlockCountRef.current;

          setMessages(prev => prev.map(msg => {
            if (msg.uuid !== streamingId) return msg;

            const existingBlocks: AnyContentBlockDto[] = Array.isArray(msg.message?.content)
              ? [...msg.message!.content]
              : [];

            // Preserve blocks from previous turns, replace current turn's blocks
            const preservedBlocks = existingBlocks.slice(0, turnStart);
            const mergedBlocks = [...preservedBlocks, ...finalTurnBlocks];

            // Update turnStartBlockCount for the next turn
            turnStartBlockCountRef.current = mergedBlocks.length;

            return {
              ...msg,
              message: { ...msg.message!, content: mergedBlocks },
              isStreaming: false,
              message_id: messageId,
              ...apiErrorFields,
            };
          }));

          // Reset active block indices (this turn is done, next turn may start new blocks)
          activeBlockIndexRef.current = -1;
          activeTextBlockIndexRef.current = -1;
          activeThinkingBlockIndexRef.current = -1;
          activeToolUseBlockIndexRef.current = -1;
          accumulatedInputJsonRef.current = '';
          // NOTE: streamingMessageIdRef is NOT reset here - next turn's stream_event
          // may continue with the same message. Only result resets it.
        } else {
          // 새 메시지 추가 (스트리밍 없이 바로 온 경우)
          const newAssistantMessage: LoadedMessageDto = {
            type: LoadedMessageType.Assistant,
            uuid: generateMessageId(),
            timestamp: new Date().toISOString(),
            message: { role: MessageRole.Assistant, content: finalTurnBlocks } as LoadedMessageDto['message'],
            isStreaming: false,
            message_id: messageId,
            ...apiErrorFields,
          };
          appendMessage(newAssistantMessage);
        }
        return;
      }

      // ── result ──
      if (eventType === 'result') {
        const errorData = cliEvent.error as { code?: string; message?: string; details?: string } | null;

        // Flush 잔여 buffer
        if ((pendingTextRef.current || pendingThinkingRef.current || pendingInputJsonRef.current) && streamingMessageIdRef.current) {
          flushPendingDeltas();
        }

        // 에러 처리
        if (errorData) {
          const err = new Error(errorData.message || 'Unknown error');
          setError(err);
          onErrorRef.current?.(err);
        }

        // result 이벤트에서 modelUsage를 통해 contextWindow/maxOutputTokens 업데이트.
        // result 이벤트엔 top-level model이 없으므로 조회 키는 system/init에서 저장한
        // currentModelRef를 1순위로 쓴다. modelUsage 키는 init model과 정확히 일치한다
        // (예: 둘 다 `claude-opus-4-8[1m]`). 혹시 모를 값에 대비해 퍼지 매칭도 유지.
        const modelUsage = cliEvent.modelUsage as Record<string, { contextWindow?: number; maxOutputTokens?: number }> | null;
        const currentModel = (cliEvent.model as string | null) ?? currentModelRef.current;
        const modelData = pickModelUsage(modelUsage, currentModel);
        if (modelData) {
          setContextWindowUsage(prev => ({
            totalTokens: prev?.totalTokens ?? 0,
            contextWindow: modelData.contextWindow ?? prev?.contextWindow ?? 0,
            maxOutputTokens: modelData.maxOutputTokens ?? prev?.maxOutputTokens ?? 0,
          }));
        } else if (modelUsage && currentModel) {
          console.warn('[useChatStream] modelUsage key miss for', currentModel, 'keys:', Object.keys(modelUsage));
        }

        // 스트리밍 종료
        endStreaming();
        return;
      }

      // ── progress ──
      if (eventType === 'progress') {
        const progressEntry: LoadedMessageDto = {
          type: LoadedMessageType.Progress,
          uuid: (cliEvent.uuid as string) || generateMessageId(),
          parentToolUseID: cliEvent.parentToolUseID as string,
          data: cliEvent.data as any,
          timestamp: (cliEvent.timestamp as string) ?? new Date().toISOString(),
        };
        appendMessage(progressEntry);
        return;
      }

      // ── user (NEW — 다른 탭/소스에서 보낸 user 메시지) ──
      if (eventType === 'user') {
        // Sub-agent user events → progress로 변환 (히스토리 로드와 동일한 형태)
        if ((cliEvent as any).parent_tool_use_id) {
          const progressEntry: LoadedMessageDto = {
            type: LoadedMessageType.Progress,
            uuid: (cliEvent as any).uuid || generateMessageId(),
            parentToolUseID: (cliEvent as any).parent_tool_use_id as string,
            data: {
              type: 'agent_progress',
              message: {
                type: 'user',
                message: cliEvent.message as any,
                uuid: (cliEvent as any).uuid,
                timestamp: (cliEvent as any).timestamp,
              },
            },
            timestamp: (cliEvent as any).timestamp ?? new Date().toISOString(),
          };
          appendMessage(progressEntry);
          return;
        }

        const userMsg = cliEvent.message as Record<string, unknown> | undefined;
        if (userMsg) {
          // Derive sourceToolUseID for isSynthetic skill-expanded prompts.
          // CLI streaming doesn't include sourceToolUseID, but sends events in order:
          //   1. user (tool_result for Skill, with tool_use_result.commandName)
          //   2. user (isSynthetic=true, the expanded skill prompt)
          // We track the tool_use_id from step 1 and apply it in step 2.
          let sourceToolUseID = (cliEvent as any).sourceToolUseID as string | undefined;

          const toolUseResult = (cliEvent as any).tool_use_result as { commandName?: string } | undefined;
          const msgContent = userMsg.content;
          if (toolUseResult?.commandName && Array.isArray(msgContent)) {
            // Step 1: tool_result for a Skill call — remember its tool_use_id
            const toolResultBlock = (msgContent as Array<Record<string, unknown>>).find(b => b.type === 'tool_result');
            if (toolResultBlock?.tool_use_id) {
              lastSkillToolUseIdRef.current = toolResultBlock.tool_use_id as string;
            }
          } else if ((cliEvent as any).isSynthetic && lastSkillToolUseIdRef.current) {
            // Step 2: isSynthetic user message right after — link to the Skill tool_use
            sourceToolUseID = lastSkillToolUseIdRef.current;
            lastSkillToolUseIdRef.current = null;
          } else {
            lastSkillToolUseIdRef.current = null;
          }

          // Keep the CLI's own timestamp. appendMessage inserts by timestamp, so
          // stamping the arrival time here would strand late-arriving CLI-internal
          // entries — notably the compact summary, which the CLI emits after the
          // assistant messages that follow it — at the end of the list (#220).
          const userMessage: LoadedMessageDto = {
            type: LoadedMessageType.User,
            uuid: (cliEvent as any).uuid || generateMessageId(),
            timestamp: (cliEvent as any).timestamp ?? new Date().toISOString(),
            message: userMsg as unknown as LoadedMessageDto['message'],
            sourceToolUseID,
            isSynthetic: (cliEvent as any).isSynthetic === true ? true : undefined,
            isCompactSummary: (cliEvent as any).isCompactSummary === true ? true : undefined,
            isVisibleInTranscriptOnly: (cliEvent as any).isVisibleInTranscriptOnly === true ? true : undefined,
          };
          appendMessage(userMessage);
        }
        return;
      }

      // ── 미지원 타입 — crash 방지 ──
      console.log('[useChatStream] Unhandled CLI_EVENT type:', eventType, cliEvent);
    });

    // SERVICE_ERROR handler — 프로세스 spawn/close 에러 (CLI 이벤트가 아닌 백엔드 자체 이벤트)
    const unsubscribeServiceError = bridge.subscribe(MessageType.SERVICE_ERROR, (message) => {
      const payload = message.payload;
      const errorType = payload?.type as string | undefined;
      const reason = payload?.reason as string | undefined;
      const errorField = payload?.error as string | undefined;

      // 두 가지 페이로드 형식 지원:
      // 형식 1 (close handler): { type: 'CLI_EXIT_ERROR', reason: '...', error: '...' }
      // 형식 2 (spawn error):   { error: '...' }
      const errorMessage = reason || errorField || 'Unknown service error';
      const err = new Error(
        errorType
          ? `Service error: ${errorType} - ${errorMessage}`
          : `Service error: ${errorMessage}`
      );
      setError(err);
      onErrorRef.current?.(err);
      endStreaming();
    });

    // AUTH_ERROR_DIAGNOSIS handler — 인증 에러 시 env API 키 진단 정보
    const unsubscribeAuthDiagnosis = bridge.subscribe(MessageType.AUTH_ERROR_DIAGNOSIS, (message) => {
      const payload = message.payload as { envApiKeys: string[]; message: string } | undefined;
      if (payload?.envApiKeys?.length) {
        setAuthDiagnosis(payload);
      }
    });

    // USER_MESSAGE_BROADCAST handler — 다른 탭에서 보낸 사용자 메시지 수신
    const unsubscribeUserBroadcast = bridge.subscribe(MessageType.USER_MESSAGE_BROADCAST, (message: IPCMessage) => {
      const content = message.payload?.content as string;
      if (!content) return;

      const userMessage: LoadedMessageDto = {
        type: LoadedMessageType.User,
        uuid: generateMessageId(),
        timestamp: new Date().toISOString(),
        message: { role: MessageRole.User, content } as any,
      };
      appendMessage(userMessage);
    });

    // STREAM_END handler — 스트림 종료 안전망
    // result나 SERVICE_ERROR가 도착하지 않은 경우에도 스트리밍 상태를 정리
    const unsubscribeStreamEnd = bridge.subscribe(MessageType.STREAM_END, () => {
      if (streamingMessageIdRef.current) {
        console.warn('[useChatStream] STREAM_END received while still streaming — ending stream as safety net');
        endStreaming();
      }
    });

    // Cleanup
    return () => {
      unsubscribeCliEvent();
      unsubscribeServiceError();
      unsubscribeAuthDiagnosis();
      unsubscribeUserBroadcast();
      unsubscribeStreamEnd();
    };
  // bridge.subscribe는 useBridge의 useCallback([], [])이므로 안정적.
  // 나머지 콜백들은 ref로 안정화했으므로 의존성에서 제외.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bridge.subscribe]);

  // Cleanup dev mode timers on unmount
  useEffect(() => {
    return () => {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
      }
      if (devModeTimeoutRef.current) {
        clearTimeout(devModeTimeoutRef.current);
      }
      if (devModeIntervalRef.current) {
        clearInterval(devModeIntervalRef.current);
      }
    };
  }, []);

  return {
    messages,
    isStreaming,
    streamingMessageId,
    error,
    authDiagnosis,
    addUserMessage,
    clearMessages,
    loadMessages,
    prependOlderMessages,
    appendMessage,
    updateMessage,
    retry,
    stop,
    resetStreamState,
    systemInit,
    contextWindowUsage,
  };
}
