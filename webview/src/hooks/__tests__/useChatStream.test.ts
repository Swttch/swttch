import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useChatStream, type LoadedMessage } from '../useChatStream';
import type { LoadedMessageDto } from '../../types';
import { ContextType, getTextContent, isAuthErrorMessage, isLimitErrorMessage } from '../../types';
import { LoadedMessageType, MessageRole } from '../../dto/common';
import { MessageType } from '@/shared';

// Mock requestAnimationFrame and cancelAnimationFrame
const rafCallbacks: ((time: number) => void)[] = [];
let rafId = 0;

vi.stubGlobal('requestAnimationFrame', vi.fn((cb: (time: number) => void) => {
  rafCallbacks.push(cb);
  return ++rafId;
}));

vi.stubGlobal('cancelAnimationFrame', vi.fn((id: number) => {
  const index = rafCallbacks.findIndex((_, i) => i === id - 1);
  if (index !== -1) {
    rafCallbacks.splice(index, 1);
  }
}));

// Helper to flush RAF callbacks
function flushRAF() {
  const callbacks = [...rafCallbacks];
  rafCallbacks.length = 0;
  callbacks.forEach(cb => cb(Date.now()));
}

// Mock bridge factory
function createMockBridge() {
  const handlers = new Map<string, Set<(msg: IPCMessage) => void>>();

  return {
    bridge: {
      isConnected: true,
      send: vi.fn().mockResolvedValue(undefined),
      subscribe: vi.fn((type: string, handler: (msg: IPCMessage) => void) => {
        if (!handlers.has(type)) handlers.set(type, new Set());
        handlers.get(type)!.add(handler);
        return () => {
          handlers.get(type)?.delete(handler);
        };
      }),
    },
    // Helper to simulate Kotlin events
    emit: (type: string, payload: Record<string, unknown>) => {
      const msg: IPCMessage = { type, payload, timestamp: Date.now() };
      handlers.get(type)?.forEach(h => h(msg));
    },
  };
}


describe('useChatStream', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rafCallbacks.length = 0;
    rafId = 0;
  });

  afterEach(() => {
    rafCallbacks.length = 0;
  });

  describe('addUserMessage', () => {
    it('user 메시지가 messages에 추가된다', () => {
      const { bridge } = createMockBridge();
      const { result } = renderHook(() => useChatStream({ bridge }));

      act(() => {
        result.current.addUserMessage('Hello');
      });

      expect(result.current.messages.length).toBe(2); // user + assistant placeholder
      expect(result.current.messages[0].type).toBe('user');
      expect(result.current.messages[0].message?.content).toBe('Hello');
    });

    it('올바른 role/content/timestamp가 포함된다', () => {
      const { bridge } = createMockBridge();
      const { result } = renderHook(() => useChatStream({ bridge }));

      const beforeTime = Date.now();
      act(() => {
        result.current.addUserMessage('Test message');
      });
      const afterTime = Date.now();

      const userMsg = result.current.messages[0];
      expect(userMsg.type).toBe('user');
      expect(userMsg.message?.content).toBe('Test message');
      const timestamp = new Date(userMsg.timestamp!).getTime();
      expect(timestamp).toBeGreaterThanOrEqual(beforeTime);
      expect(timestamp).toBeLessThanOrEqual(afterTime);
      expect(userMsg.uuid).toBeDefined();
    });

    it('assistant placeholder가 자동 생성되고 isStreaming=true', () => {
      const { bridge } = createMockBridge();
      const { result } = renderHook(() => useChatStream({ bridge }));

      act(() => {
        result.current.addUserMessage('Hello');
      });

      const assistantMsg = result.current.messages[1];
      expect(assistantMsg.type).toBe('assistant');
      expect(assistantMsg.message?.content).toEqual([]);
      expect(assistantMsg.isStreaming).toBe(true);
      expect(result.current.isStreaming).toBe(true);
      expect(result.current.streamingMessageId).toBe(assistantMsg.uuid);
    });

    it('빈 문자열은 무시된다', () => {
      const { bridge } = createMockBridge();
      const { result } = renderHook(() => useChatStream({ bridge }));

      act(() => {
        result.current.addUserMessage('   ');
      });

      expect(result.current.messages.length).toBe(0);
    });

    it('context가 올바르게 저장된다', () => {
      const { bridge } = createMockBridge();
      const { result } = renderHook(() => useChatStream({ bridge }));

      const context = [
        { type: ContextType.File, path: '/test.ts', content: 'test content' },
      ];

      act(() => {
        result.current.addUserMessage('Hello', context);
      });

      expect(result.current.messages[0].context).toEqual(context);
    });
  });

  describe('stream_event 처리', () => {
    it('text_delta 수신 시 streamingMessageId가 없으면 assistant placeholder 자동 생성', () => {
      const { bridge, emit } = createMockBridge();
      const { result } = renderHook(() => useChatStream({ bridge }));

      // Emit text_delta without prior message
      act(() => {
        emit(MessageType.CLI_EVENT, {
          type: 'stream_event',
          event: { delta: { type: 'text_delta', text: 'Hello' } },
        });
      });

      // Should auto-create assistant message
      expect(result.current.messages.length).toBe(1);
      expect(result.current.messages[0].type).toBe('assistant');
      expect(result.current.isStreaming).toBe(true);
      expect(result.current.streamingMessageId).toBeDefined();
    });

    it('연속 text_delta가 content에 축적된다', () => {
      const { bridge, emit } = createMockBridge();
      const { result } = renderHook(() => useChatStream({ bridge }));

      act(() => {
        emit(MessageType.CLI_EVENT, { type: 'stream_event', event: { delta: { type: 'text_delta', text: 'Hello' } } });
        flushRAF();
      });

      act(() => {
        emit(MessageType.CLI_EVENT, { type: 'stream_event', event: { delta: { type: 'text_delta', text: ' world' } } });
        flushRAF();
      });

      act(() => {
        emit(MessageType.CLI_EVENT, { type: 'stream_event', event: { delta: { type: 'text_delta', text: '!' } } });
        flushRAF();
      });

      expect(result.current.messages[0].message?.content).toEqual([{ type: 'text', text: 'Hello world!' }]);
    });

    it('isStreaming이 true로 전환된다', () => {
      const { bridge, emit } = createMockBridge();
      const { result } = renderHook(() => useChatStream({ bridge }));

      expect(result.current.isStreaming).toBe(false);

      act(() => {
        emit(MessageType.CLI_EVENT, { type: 'stream_event', event: { delta: { type: 'text_delta', text: 'Test' } } });
      });

      expect(result.current.isStreaming).toBe(true);
    });

    it('system 이벤트 수신 시 onSystemMessage 콜백 호출', () => {
      const { bridge, emit } = createMockBridge();
      const onSystemMessage = vi.fn();
      renderHook(() => useChatStream({ bridge, onSystemMessage }));

      act(() => {
        emit(MessageType.CLI_EVENT, {
          type: 'system',
          subtype: 'init',
          sessionId: 'session-123',
          content: { type: 'status', message: 'Processing' },
        });
      });

      expect(onSystemMessage).toHaveBeenCalledWith({
        type: 'system',
        subtype: 'init',
        sessionId: 'session-123',
        content: { type: 'status', message: 'Processing' },
      });
    });

    it('시스템 메시지는 delta 처리를 스킵한다', () => {
      const { bridge, emit } = createMockBridge();
      const { result } = renderHook(() => useChatStream({ bridge }));

      act(() => {
        emit(MessageType.CLI_EVENT, {
          type: 'system',
          subtype: 'init',
          sessionId: 'session-123',
          content: 'System message',
        });
      });

      // No messages should be added
      expect(result.current.messages.length).toBe(0);
      expect(result.current.isStreaming).toBe(false);
    });
  });

  describe('result 처리', () => {
    it('수신 시 isStreaming이 false로 전환된다', () => {
      const { bridge, emit } = createMockBridge();
      const { result } = renderHook(() => useChatStream({ bridge }));

      // Start streaming
      act(() => {
        emit(MessageType.CLI_EVENT, { type: 'stream_event', event: { delta: { type: 'text_delta', text: 'Hello' } } });
      });

      expect(result.current.isStreaming).toBe(true);

      // End streaming
      act(() => {
        emit(MessageType.CLI_EVENT, { type: 'result' });
      });

      expect(result.current.isStreaming).toBe(false);
    });

    it('streamingMessageId가 null로 리셋된다', () => {
      const { bridge, emit } = createMockBridge();
      const { result } = renderHook(() => useChatStream({ bridge }));

      act(() => {
        emit(MessageType.CLI_EVENT, { type: 'stream_event', event: { delta: { type: 'text_delta', text: 'Hello' } } });
      });

      expect(result.current.streamingMessageId).not.toBeNull();

      act(() => {
        emit(MessageType.CLI_EVENT, { type: 'result' });
      });

      expect(result.current.streamingMessageId).toBeNull();
    });

    it('에러 payload 시 error 상태가 설정된다', () => {
      const { bridge, emit } = createMockBridge();
      const onError = vi.fn();
      const { result } = renderHook(() => useChatStream({ bridge, onError }));

      act(() => {
        emit(MessageType.CLI_EVENT, { type: 'stream_event', event: { delta: { type: 'text_delta', text: 'Hello' } } });
      });

      act(() => {
        emit(MessageType.CLI_EVENT, {
          type: 'result',
          error: { code: 'ERR_001', message: 'Test error', details: 'Details' },
        });
      });

      expect(result.current.error).toBeDefined();
      expect(result.current.error?.message).toBe('Test error');
      expect(onError).toHaveBeenCalled();
    });

    it('onStreamEnd 콜백이 호출된다', () => {
      const { bridge, emit } = createMockBridge();
      const onStreamEnd = vi.fn();
      const { result } = renderHook(() => useChatStream({ bridge, onStreamEnd }));

      act(() => {
        result.current.addUserMessage('Test');
      });

      const streamingId = result.current.streamingMessageId;

      act(() => {
        emit(MessageType.CLI_EVENT, { type: 'result' });
      });

      expect(onStreamEnd).toHaveBeenCalledWith(streamingId);
    });
  });

  // A tool_use block's input arrives as `input_json_delta`, which is buffered and
  // applied on the next RAF frame. Measured against a live CLI, the `assistant`
  // event for the same turn can arrive *before* that frame runs — and it resets
  // the active-block index. The buffered delta then had no block to write to and
  // was dropped, leaving the tool card with an empty input (issue #232).
  describe('tool_use input_json_delta와 assistant 이벤트 경합 (issue #232)', () => {
    const TOOL_ID = 'toolu_probe232';

    it('assistant 이벤트가 flush보다 먼저 와도 누적된 input이 유실되지 않는다', () => {
      const { bridge, emit } = createMockBridge();
      const { result } = renderHook(() => useChatStream({ bridge }));

      act(() => {
        emit(MessageType.CLI_EVENT, {
          type: 'stream_event',
          event: {
            type: 'content_block_start',
            index: 0,
            content_block: { type: 'tool_use', id: TOOL_ID, name: 'Write', input: {} },
          },
        });
      });

      // The input streams in as partial JSON; it is buffered, not yet applied.
      act(() => {
        emit(MessageType.CLI_EVENT, {
          type: 'stream_event',
          event: {
            type: 'content_block_delta',
            index: 0,
            delta: { type: 'input_json_delta', partial_json: '{"file_path":"/tmp/a.txt"}' },
          },
        });
      });

      // Measured ordering: the `assistant` event lands *before* the RAF frame and
      // resets the active-block index, then content_block_stop forces the flush.
      // The assistant payload here carries only the id/name — no `input` — so the
      // buffered delta is the only source of the tool's arguments.
      act(() => {
        emit(MessageType.CLI_EVENT, {
          type: 'assistant',
          message: {
            id: 'msg_probe232',
            content: [{ type: 'tool_use', id: TOOL_ID, name: 'Write', input: {} }],
          },
        });
        emit(MessageType.CLI_EVENT, {
          type: 'stream_event',
          event: { type: 'content_block_stop', index: 0 },
        });
        flushRAF();
      });

      const blocks = result.current.messages[0].message?.content as Array<{
        type: string;
        input?: Record<string, unknown>;
      }>;
      const toolUse = blocks.find(b => b.type === 'tool_use');
      expect(toolUse?.input).toEqual({ file_path: '/tmp/a.txt' });
    });
  });

  describe('assistant 처리', () => {
    it('완성된 content가 처리된다', () => {
      const { bridge, emit } = createMockBridge();
      const { result } = renderHook(() => useChatStream({ bridge }));

      // Start streaming
      act(() => {
        result.current.addUserMessage('Test');
      });

      const streamingId = result.current.streamingMessageId;

      // Receive complete assistant message
      act(() => {
        emit(MessageType.CLI_EVENT, {
          type: 'assistant',
          message: {
            id: 'msg_123',
            content: [
              { type: 'text', text: 'Hello world' },
            ],
          },
        });
      });

      const assistantMsg = result.current.messages.find(m => m.uuid === streamingId);
      expect(assistantMsg?.message?.content).toEqual([
        { type: 'text', text: 'Hello world' },
      ]);
      expect(assistantMsg?.message_id).toBe('msg_123');
    });

    it('tool_use blocks가 content 배열에 포함된다', () => {
      const { bridge, emit } = createMockBridge();
      const { result } = renderHook(() => useChatStream({ bridge }));

      act(() => {
        result.current.addUserMessage('Test');
      });

      const expectedContent = [
        { type: 'text', text: 'Using tool' },
        {
          type: 'tool_use',
          id: 'tool_1',
          name: 'read_file',
          input: { path: '/test.ts' },
        },
      ];

      act(() => {
        emit(MessageType.CLI_EVENT, {
          type: 'assistant',
          message: {
            id: 'msg_123',
            content: expectedContent,
          },
        });
      });

      const assistantMsg = result.current.messages[1];
      expect(assistantMsg.message?.content).toEqual(expectedContent);
    });

    it('여러 text blocks가 배열로 저장된다', () => {
      const { bridge, emit } = createMockBridge();
      const { result } = renderHook(() => useChatStream({ bridge }));

      act(() => {
        result.current.addUserMessage('Test');
      });

      const expectedContent = [
        { type: 'text', text: 'First paragraph' },
        { type: 'text', text: 'Second paragraph' },
        { type: 'text', text: 'Third paragraph' },
      ];

      act(() => {
        emit(MessageType.CLI_EVENT, {
          type: 'assistant',
          message: {
            id: 'msg_123',
            content: expectedContent,
          },
        });
      });

      const assistantMsg = result.current.messages[1];
      expect(assistantMsg.message?.content).toEqual(expectedContent);
    });

    it('streamingMessageId가 없으면 새 메시지를 추가한다', () => {
      const { bridge, emit } = createMockBridge();
      const { result } = renderHook(() => useChatStream({ bridge }));

      // Emit without prior streaming
      act(() => {
        emit(MessageType.CLI_EVENT, {
          type: 'assistant',
          message: {
            id: 'msg_123',
            content: [
              { type: 'text', text: 'Direct message' },
            ],
          },
        });
      });

      expect(result.current.messages.length).toBe(1);
      expect(result.current.messages[0].type).toBe('assistant');
      expect(result.current.messages[0].message?.content).toEqual([
        { type: 'text', text: 'Direct message' },
      ]);
    });
  });

  describe('SERVICE_ERROR 구독', () => {
    it('에러 수신 시 error 상태가 설정된다', () => {
      const { bridge, emit } = createMockBridge();
      const { result } = renderHook(() => useChatStream({ bridge }));

      act(() => {
        emit(MessageType.SERVICE_ERROR, {
          type: 'CONNECTION_ERROR',
          reason: 'Network timeout',
        });
      });

      expect(result.current.error).toBeDefined();
      expect(result.current.error?.message).toContain('CONNECTION_ERROR');
      expect(result.current.error?.message).toContain('Network timeout');
    });

    it('스트리밍이 종료된다', () => {
      const { bridge, emit } = createMockBridge();
      const { result } = renderHook(() => useChatStream({ bridge }));

      act(() => {
        result.current.addUserMessage('Test');
      });

      expect(result.current.isStreaming).toBe(true);

      act(() => {
        emit(MessageType.SERVICE_ERROR, {
          type: 'API_ERROR',
          reason: 'Invalid request',
        });
      });

      expect(result.current.isStreaming).toBe(false);
    });

    it('onError 콜백이 호출된다', () => {
      const { bridge, emit } = createMockBridge();
      const onError = vi.fn();
      renderHook(() => useChatStream({ bridge, onError }));

      act(() => {
        emit(MessageType.SERVICE_ERROR, {
          type: 'API_ERROR',
          reason: 'Test error',
        });
      });

      expect(onError).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('clearMessages / loadMessages', () => {
    it('clearMessages로 messages가 빈 배열이 된다', () => {
      const { bridge } = createMockBridge();
      const { result } = renderHook(() => useChatStream({ bridge }));

      act(() => {
        result.current.addUserMessage('Test');
      });

      expect(result.current.messages.length).toBeGreaterThan(0);

      act(() => {
        result.current.clearMessages();
      });

      expect(result.current.messages.length).toBe(0);
    });

    it('clearMessages로 error도 초기화된다', () => {
      const { bridge, emit } = createMockBridge();
      const { result } = renderHook(() => useChatStream({ bridge }));

      act(() => {
        emit(MessageType.SERVICE_ERROR, {
          type: MessageType.ERROR,
          reason: 'Test',
        });
      });

      expect(result.current.error).toBeDefined();

      act(() => {
        result.current.clearMessages();
      });

      expect(result.current.error).toBeNull();
    });

    it('loadMessages로 기존 메시지가 로드된다', () => {
      const { bridge } = createMockBridge();
      const { result } = renderHook(() => useChatStream({ bridge }));

      const loadedMessages: LoadedMessage[] = [
        {
          uuid: 'loaded-msg-1',
          type: LoadedMessageType.User,
          timestamp: '2024-01-01T00:00:00Z',
          message: { role: MessageRole.User, content: 'Hello' },
        },
        {
          uuid: 'loaded-msg-2',
          type: LoadedMessageType.Assistant,
          timestamp: '2024-01-01T00:00:01Z',
          message: { role: MessageRole.Assistant, content: 'Hi there' },
        },
      ];

      act(() => {
        result.current.loadMessages(loadedMessages);
      });

      expect(result.current.messages.length).toBe(2);
      // loadMessages transforms via toInstance(MessageDto, raw) - check transformed structure
      expect((result.current.messages[0] as any).type ?? (result.current.messages[0] as any).role).toBeDefined();
      expect((result.current.messages[1] as any).type ?? (result.current.messages[1] as any).role).toBeDefined();
    });

    it('loadMessages는 기존 messages를 대체한다', () => {
      const { bridge } = createMockBridge();
      const { result } = renderHook(() => useChatStream({ bridge }));

      act(() => {
        result.current.addUserMessage('Old message');
      });

      const loadedMessages: LoadedMessage[] = [
        {
          uuid: 'new-msg-1',
          type: LoadedMessageType.User,
          timestamp: '2024-01-01T00:00:00Z',
          message: { role: MessageRole.User, content: 'New message' },
        },
      ];

      act(() => {
        result.current.loadMessages(loadedMessages);
      });

      expect(result.current.messages.length).toBe(1);
    });
  });

  describe('appendMessage / updateMessage', () => {
    it('appendMessage로 메시지를 추가할 수 있다', () => {
      const { bridge } = createMockBridge();
      const { result } = renderHook(() => useChatStream({ bridge }));

      const newMessage = {
        uuid: 'test-123',
        type: 'assistant' as const,
        message: { role: 'assistant' as const, content: 'Test message' },
        timestamp: new Date().toISOString(),
      } as LoadedMessageDto;

      act(() => {
        result.current.appendMessage(newMessage);
      });

      expect(result.current.messages.length).toBe(1);
      expect(result.current.messages[0]).toEqual(newMessage);
    });

    it('updateMessage로 기존 메시지를 업데이트할 수 있다', () => {
      const { bridge } = createMockBridge();
      const { result } = renderHook(() => useChatStream({ bridge }));

      const message = {
        uuid: 'test-123',
        type: 'assistant' as const,
        message: { role: 'assistant' as const, content: 'Original' },
        timestamp: new Date().toISOString(),
      } as LoadedMessageDto;

      act(() => {
        result.current.appendMessage(message);
      });

      act(() => {
        result.current.updateMessage('test-123', { isStreaming: false });
      });

      expect(result.current.messages[0].isStreaming).toBe(false);
    });

    it('updateMessage는 다른 메시지에 영향을 주지 않는다', () => {
      const { bridge } = createMockBridge();
      const { result } = renderHook(() => useChatStream({ bridge }));

      const message1 = {
        uuid: 'msg-1',
        type: 'user' as const,
        message: { role: 'user' as const, content: 'First' },
        timestamp: new Date().toISOString(),
      } as LoadedMessageDto;

      const message2 = {
        uuid: 'msg-2',
        type: 'assistant' as const,
        message: { role: 'assistant' as const, content: 'Second' },
        timestamp: new Date().toISOString(),
      } as LoadedMessageDto;

      act(() => {
        result.current.appendMessage(message1);
        result.current.appendMessage(message2);
      });

      act(() => {
        result.current.updateMessage('msg-1', { isStreaming: true });
      });

      expect(result.current.messages[0].isStreaming).toBe(true);
      expect(result.current.messages[1].isStreaming).toBeUndefined();
    });
  });

  describe('retry', () => {
    it('실패한 메시지를 재시도할 수 있다', () => {
      const { bridge } = createMockBridge();
      const { result } = renderHook(() => useChatStream({ bridge }));

      // Add initial message
      act(() => {
        result.current.addUserMessage('Test message');
      });

      const assistantMessageId = result.current.messages[1].uuid!;

      // Simulate failure
      act(() => {
        result.current.updateMessage(assistantMessageId, {
          isStreaming: false,
        });
      });

      // Clear streaming state
      act(() => {
        result.current.stop();
      });

      // Retry
      act(() => {
        result.current.retry(assistantMessageId);
      });

      // Should have sent message via bridge
      expect(bridge.send).toHaveBeenCalledWith(MessageType.SEND_MESSAGE, {
        content: 'Test message',
        context: [],
      });
    });

    it('retry는 실패한 메시지 이후의 메시지들을 제거한다', () => {
      const { bridge } = createMockBridge();
      const { result } = renderHook(() => useChatStream({ bridge }));

      // Add multiple exchanges
      act(() => {
        result.current.addUserMessage('First');
      });

      // Manually end streaming to add second message
      act(() => {
        result.current.stop();
      });

      const firstAssistantId = result.current.messages[1].uuid!;

      // The retry should remove messages from the failed one onwards
      act(() => {
        result.current.retry(firstAssistantId);
      });

      // Messages should be truncated and new messages added
      expect(result.current.messages.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('callbacks', () => {
    it('onStreamStart가 스트림 시작 시 호출된다', () => {
      const { bridge } = createMockBridge();
      const onStreamStart = vi.fn();
      const { result } = renderHook(() => useChatStream({ bridge, onStreamStart }));

      act(() => {
        result.current.addUserMessage('Test');
      });

      expect(onStreamStart).toHaveBeenCalledWith(result.current.streamingMessageId);
    });

    it('onStreamEnd가 스트림 종료 시 호출된다', () => {
      const { bridge, emit } = createMockBridge();
      const onStreamEnd = vi.fn();
      const { result } = renderHook(() => useChatStream({ bridge, onStreamEnd }));

      act(() => {
        result.current.addUserMessage('Test');
      });

      const streamingId = result.current.streamingMessageId;

      act(() => {
        emit(MessageType.CLI_EVENT, { type: 'result' });
      });

      expect(onStreamEnd).toHaveBeenCalledWith(streamingId);
    });
  });

  describe('RAF throttling', () => {
    it('여러 text_delta가 RAF를 통해 배치 처리된다', () => {
      const { bridge, emit } = createMockBridge();
      const { result } = renderHook(() => useChatStream({ bridge }));

      act(() => {
        emit(MessageType.CLI_EVENT, { type: 'stream_event', event: { delta: { type: 'text_delta', text: 'A' } } });
        emit(MessageType.CLI_EVENT, { type: 'stream_event', event: { delta: { type: 'text_delta', text: 'B' } } });
        emit(MessageType.CLI_EVENT, { type: 'stream_event', event: { delta: { type: 'text_delta', text: 'C' } } });
      });

      // Before RAF flush, content should not be updated yet
      // (Due to RAF batching, content accumulates in pendingDelta)

      act(() => {
        flushRAF();
      });

      // After RAF flush, all deltas should be accumulated
      const assistantMsg = result.current.messages[0];
      expect(assistantMsg.message?.content).toEqual([{ type: 'text', text: 'ABC' }]);
    });
  });

  describe('thinking token estimate & duration', () => {
    // Helper: open a thinking block at content index 0.
    function startThinkingBlock(emit: (t: string, p: Record<string, unknown>) => void) {
      act(() => {
        emit(MessageType.CLI_EVENT, {
          type: 'stream_event',
          event: { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '' } },
        });
      });
    }

    it('system/thinking_tokens 수신 시 활성 thinking 블록에 estimatedTokens가 반영된다', () => {
      const { bridge, emit } = createMockBridge();
      const { result } = renderHook(() => useChatStream({ bridge }));

      startThinkingBlock(emit);

      act(() => {
        emit(MessageType.CLI_EVENT, { type: 'system', subtype: 'thinking_tokens', estimated_tokens: 28, estimated_tokens_delta: 27 });
        emit(MessageType.CLI_EVENT, { type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'The' } } });
        flushRAF();
      });

      const block = result.current.messages[0].message?.content as unknown as Array<Record<string, unknown>>;
      expect(block[0]).toMatchObject({ type: 'thinking', thinking: 'The', estimatedTokens: 28 });
    });

    it('마지막 thinking_tokens 값이 누적 절대값으로 유지된다', () => {
      const { bridge, emit } = createMockBridge();
      const { result } = renderHook(() => useChatStream({ bridge }));

      startThinkingBlock(emit);

      act(() => {
        emit(MessageType.CLI_EVENT, { type: 'system', subtype: 'thinking_tokens', estimated_tokens: 28 });
        flushRAF();
      });
      act(() => {
        emit(MessageType.CLI_EVENT, { type: 'system', subtype: 'thinking_tokens', estimated_tokens: 288 });
        flushRAF();
      });

      const block = result.current.messages[0].message?.content as unknown as Array<Record<string, unknown>>;
      expect(block[0]).toMatchObject({ estimatedTokens: 288 });
    });

    it('content_block_stop 시 thinking 블록에 durationMillis가 기록된다', () => {
      const { bridge, emit } = createMockBridge();
      const { result } = renderHook(() => useChatStream({ bridge }));

      startThinkingBlock(emit);
      act(() => {
        emit(MessageType.CLI_EVENT, { type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'done' } } });
        flushRAF();
      });
      act(() => {
        emit(MessageType.CLI_EVENT, { type: 'stream_event', event: { type: 'content_block_stop', index: 0 } });
      });

      const block = result.current.messages[0].message?.content as unknown as Array<Record<string, unknown>>;
      expect(typeof block[0].durationMillis).toBe('number');
      expect(block[0].durationMillis as number).toBeGreaterThanOrEqual(0);
    });

    it('assistant 이벤트가 content_block_stop보다 먼저 와도 durationMillis가 기록된다 (인덱스 ref 리셋 회귀 방지)', () => {
      const { bridge, emit } = createMockBridge();
      const { result } = renderHook(() => useChatStream({ bridge }));

      startThinkingBlock(emit);
      act(() => {
        emit(MessageType.CLI_EVENT, { type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'done' } } });
        flushRAF();
      });
      // Real CLI ordering: the `assistant` event (final blocks) lands BEFORE the
      // thinking content_block_stop and resets the active-block index refs.
      act(() => {
        emit(MessageType.CLI_EVENT, {
          type: 'assistant',
          message: { id: 'msg_1', content: [{ type: 'thinking', thinking: 'done' }] },
        });
      });
      act(() => {
        emit(MessageType.CLI_EVENT, { type: 'stream_event', event: { type: 'content_block_stop', index: 0 } });
      });

      const block = result.current.messages[0].message?.content as unknown as Array<Record<string, unknown>>;
      expect(block[0]).toMatchObject({ type: 'thinking' });
      expect(typeof block[0].durationMillis).toBe('number');
    });
  });

  describe('contextWindowUsage', () => {
    // 실측 기준(claude-opus-4-8[1m]): system/init.model === 'claude-opus-4-8[1m]',
    // result 이벤트엔 top-level model이 없고 modelUsage 키가 init.model과 동일하다.
    const MODEL = 'claude-opus-4-8[1m]';

    it('result 이벤트에 top-level model이 없어도 system/init의 model 키로 modelUsage를 조회해 contextWindow를 반영한다', () => {
      const { bridge, emit } = createMockBridge();
      const { result } = renderHook(() => useChatStream({ bridge }));

      act(() => {
        emit(MessageType.CLI_EVENT, { type: 'system', subtype: 'init', model: MODEL });
      });
      act(() => {
        emit(MessageType.CLI_EVENT, {
          type: 'assistant',
          message: {
            id: 'm1',
            role: 'assistant',
            content: [],
            usage: {
              input_tokens: 100,
              output_tokens: 5,
              cache_read_input_tokens: 200,
              cache_creation_input_tokens: 300,
            },
          },
        });
      });
      // top-level model 없음 — 오직 modelUsage 키로만 조회 가능
      act(() => {
        emit(MessageType.CLI_EVENT, {
          type: 'result',
          modelUsage: { [MODEL]: { contextWindow: 1_000_000, maxOutputTokens: 64_000 } },
        });
      });

      expect(result.current.contextWindowUsage).toEqual({
        totalTokens: 605,
        contextWindow: 1_000_000,
        maxOutputTokens: 64_000,
      });
    });

    it('modelUsage에 키가 여러 개여도 init의 모델 키로 정확히 매칭한다 (단일 키 폴백에 의존하지 않음)', () => {
      const { bridge, emit } = createMockBridge();
      const { result } = renderHook(() => useChatStream({ bridge }));

      act(() => {
        emit(MessageType.CLI_EVENT, { type: 'system', subtype: 'init', model: MODEL });
      });
      act(() => {
        emit(MessageType.CLI_EVENT, {
          type: 'result',
          // subagent 등으로 여러 모델이 섞인 상황: top-level model 없이 정확 키 매칭이 필요
          modelUsage: {
            'claude-haiku-4-5': { contextWindow: 200_000, maxOutputTokens: 8_000 },
            [MODEL]: { contextWindow: 1_000_000, maxOutputTokens: 64_000 },
          },
        });
      });

      expect(result.current.contextWindowUsage?.contextWindow).toBe(1_000_000);
      expect(result.current.contextWindowUsage?.maxOutputTokens).toBe(64_000);
    });

    it('result 이전(assistant usage만 도착)에는 contextWindow가 0이다 — 임의의 200k로 부풀리지 않는다', () => {
      const { bridge, emit } = createMockBridge();
      const { result } = renderHook(() => useChatStream({ bridge }));

      act(() => {
        emit(MessageType.CLI_EVENT, { type: 'system', subtype: 'init', model: MODEL });
      });
      act(() => {
        emit(MessageType.CLI_EVENT, {
          type: 'assistant',
          message: {
            id: 'm1',
            role: 'assistant',
            content: [],
            usage: { input_tokens: 500_000, output_tokens: 0 },
          },
        });
      });

      // 아직 modelUsage를 못 받았으므로 게이지는 그려지지 않아야 한다(contextWindow 0).
      expect(result.current.contextWindowUsage?.totalTokens).toBe(500_000);
      expect(result.current.contextWindowUsage?.contextWindow).toBe(0);
    });
  });

  // 컴팩트(auto-compact / `/compact`) 경계 엔트리는 CLI가 `isCompactSummary: true`를 단
  // 평범한 `user` 이벤트로 흘려보낸다. 이 이벤트는 뒤이은 assistant 응답보다 늦게 도착할 수
  // 있어, appendMessage는 timestamp 기준으로 삽입 위치를 정한다. 따라서 `user` 핸들러가
  // CLI 원본 timestamp를 보존하지 않으면 정렬 근거가 사라져 요약 버블이 항상 목록 끝에
  // 눌러앉는다 (issue #220).
  describe('user 이벤트 순서 (컴팩트 요약, issue #220)', () => {
    const COMPACT_TEXT =
      'This session is being continued from a previous conversation that ran out of context.';

    it('CLI 원본 timestamp를 보존한다', () => {
      const { bridge, emit } = createMockBridge();
      const { result } = renderHook(() => useChatStream({ bridge }));

      act(() => {
        emit(MessageType.CLI_EVENT, {
          type: 'user',
          uuid: 'compact-1',
          timestamp: '2026-07-24T11:41:57.478Z',
          isCompactSummary: true,
          message: { role: 'user', content: COMPACT_TEXT },
        });
      });

      expect(result.current.messages[0].timestamp).toBe('2026-07-24T11:41:57.478Z');
    });

    it('먼저 도착한 뒤늦은 assistant 메시지보다 앞에 삽입된다', () => {
      const { bridge, emit } = createMockBridge();
      const { result } = renderHook(() => useChatStream({ bridge }));

      // 컴팩트 이후의 assistant 응답이 먼저 도착한다.
      act(() => {
        emit(MessageType.CLI_EVENT, {
          type: 'assistant',
          timestamp: '2026-07-24T11:42:30.000Z',
          message: {
            id: 'm-after',
            role: 'assistant',
            content: [{ type: 'text', text: 'after compact' }],
          },
        });
      });

      // 컴팩트 요약 user 이벤트가 뒤늦게 도착한다 (더 이른 timestamp).
      act(() => {
        emit(MessageType.CLI_EVENT, {
          type: 'user',
          uuid: 'compact-1',
          timestamp: '2026-07-24T11:41:57.478Z',
          isCompactSummary: true,
          message: { role: 'user', content: COMPACT_TEXT },
        });
      });

      // 요약이 목록 끝이 아니라 assistant 응답 앞에 놓여야 한다.
      const types = result.current.messages.map(m => m.type);
      expect(types).toEqual([LoadedMessageType.User, LoadedMessageType.Assistant]);
      expect(result.current.messages[0].message?.content).toBe(COMPACT_TEXT);
    });

    it('컴팩트 마커 필드(isCompactSummary/isVisibleInTranscriptOnly)를 보존한다', () => {
      const { bridge, emit } = createMockBridge();
      const { result } = renderHook(() => useChatStream({ bridge }));

      act(() => {
        emit(MessageType.CLI_EVENT, {
          type: 'user',
          uuid: 'compact-1',
          timestamp: '2026-07-24T11:41:57.478Z',
          isCompactSummary: true,
          isVisibleInTranscriptOnly: true,
          message: { role: 'user', content: COMPACT_TEXT },
        });
      });

      expect(result.current.messages[0].isCompactSummary).toBe(true);
      expect(result.current.messages[0].isVisibleInTranscriptOnly).toBe(true);
    });

    it('timestamp 없는 user 이벤트는 수신 시각으로 폴백한다', () => {
      const { bridge, emit } = createMockBridge();
      const { result } = renderHook(() => useChatStream({ bridge }));

      const before = Date.now();
      act(() => {
        emit(MessageType.CLI_EVENT, {
          type: 'user',
          uuid: 'no-ts',
          message: { role: 'user', content: 'no timestamp' },
        });
      });
      const after = Date.now();

      const ts = new Date(result.current.messages[0].timestamp!).getTime();
      expect(ts).toBeGreaterThanOrEqual(before);
      expect(ts).toBeLessThanOrEqual(after);
    });
  });

  // 스트리밍 중 사용자가 입력한 메시지는 입력한 자리에 고정돼야 한다. assistant 한 턴은
  // 단일 요소로 렌더링되므로, 진행 중인 응답을 그대로 두면 델타가 쌓일 때마다 그 요소가
  // 커지면서 방금 붙인 사용자 버블을 화면 아래로 계속 밀어낸다 (issue #220).
  describe('스트리밍 중 사용자 메시지 순서 (issue #220)', () => {
    it('진행 중인 assistant 버블보다 뒤에 표시된다', () => {
      const { bridge, emit } = createMockBridge();
      const { result } = renderHook(() => useChatStream({ bridge }));

      // 첫 턴 시작 — assistant 버블이 스트리밍 중이다.
      act(() => {
        result.current.addUserMessage('first');
      });
      act(() => {
        emit(MessageType.CLI_EVENT, {
          type: 'stream_event',
          event: { delta: { type: 'text_delta', text: 'working...' } },
        });
      });
      act(() => flushRAF());

      expect(result.current.isStreaming).toBe(true);

      // 턴이 끝나기 전에 사용자가 두 번째 메시지를 보낸다.
      act(() => {
        result.current.addUserMessage('mid-stream probe');
      });

      // 새 사용자 메시지가 목록 맨 끝에 있어야 한다.
      const last = result.current.messages[result.current.messages.length - 1];
      expect(last.type).toBe(LoadedMessageType.User);
      expect(last.message?.content).toBe('mid-stream probe');
    });

    it('이후 델타는 사용자 메시지를 밀지 않고 새 버블에 쌓인다', () => {
      const { bridge, emit } = createMockBridge();
      const { result } = renderHook(() => useChatStream({ bridge }));

      act(() => {
        result.current.addUserMessage('first');
      });
      act(() => {
        emit(MessageType.CLI_EVENT, {
          type: 'stream_event',
          event: { delta: { type: 'text_delta', text: 'part one ' } },
        });
      });
      act(() => flushRAF());

      const beforeText = getTextContent(result.current.messages[1]);

      // 턴 도중 사용자가 메시지를 보낸다.
      act(() => {
        result.current.addUserMessage('벌써?');
      });
      const userIndex = result.current.messages.length - 1;

      // 응답이 계속 스트리밍된다.
      act(() => {
        emit(MessageType.CLI_EVENT, {
          type: 'stream_event',
          event: { delta: { type: 'text_delta', text: 'part two' } },
        });
      });
      act(() => flushRAF());

      // 사용자 메시지 위의 assistant 버블은 더 이상 자라지 않는다.
      expect(getTextContent(result.current.messages[1])).toBe(beforeText);

      // 사용자 메시지는 자기 자리를 지키고, 이후 텍스트는 그 아래 새 버블에 담긴다.
      expect(result.current.messages[userIndex].message?.content).toBe('벌써?');
      const after = result.current.messages.slice(userIndex + 1);
      expect(after.length).toBeGreaterThan(0);
      expect(getTextContent(after[after.length - 1])).toContain('part two');
    });
  });

  describe('CLI가 턴 도중 보낸 메시지 위치 (Stop hook 피드백, issue #211)', () => {
    // 실제 CLI가 Stop hook 실행 후 내보내는 엔트리 모양.
    // isCompactSummary도 isVisibleInTranscriptOnly도 없고, isSynthetic만 붙는다.
    const STOP_HOOK_TEXT =
      'Stop hook feedback:\n[resume]: the goal remains in-progress, not complete.';

    const emitStopHookFeedback = (
      emit: (type: string, payload: Record<string, unknown>) => void,
      opts: { uuid: string; timestamp: string; text?: string },
    ) => {
      emit(MessageType.CLI_EVENT, {
        type: 'user',
        uuid: opts.uuid,
        timestamp: opts.timestamp,
        isSynthetic: true,
        message: { role: 'user', content: opts.text ?? STOP_HOOK_TEXT },
      });
    };

    it('늦게 도착해도 CLI timestamp 자리에 삽입된다', () => {
      const { bridge, emit } = createMockBridge();
      const { result } = renderHook(() => useChatStream({ bridge }));

      // 훅 피드백보다 나중 시각의 메시지가 이미 화면에 있다.
      act(() => {
        emit(MessageType.CLI_EVENT, {
          type: 'user',
          uuid: 'later',
          timestamp: '2026-07-26T20:50:30.000Z',
          message: { role: 'user', content: 'next iteration' },
        });
      });

      // 훅 피드백은 그보다 이른 시각인데 뒤늦게 도착한다.
      act(() => {
        emitStopHookFeedback(emit, {
          uuid: 'stop-1',
          timestamp: '2026-07-26T20:50:03.297Z',
        });
      });

      // 맨 끝이 아니라 시간순 제자리(앞)에 놓여야 한다.
      const contents = result.current.messages.map(m => m.message?.content);
      expect(contents).toEqual([STOP_HOOK_TEXT, 'next iteration']);
    });

    it('사이클을 반복해도 화면 하단에 쌓이지 않는다', () => {
      const { bridge, emit } = createMockBridge();
      const { result } = renderHook(() => useChatStream({ bridge }));

      // 이터레이션 3회: 각 훅 피드백 뒤에 다음 턴의 결과가 이어진다.
      const cycles = [
        { hookTs: '2026-07-26T20:50:03.000Z', turnTs: '2026-07-26T20:50:10.000Z' },
        { hookTs: '2026-07-26T20:51:03.000Z', turnTs: '2026-07-26T20:51:10.000Z' },
        { hookTs: '2026-07-26T20:52:03.000Z', turnTs: '2026-07-26T20:52:10.000Z' },
      ];

      cycles.forEach((c, i) => {
        act(() => {
          emitStopHookFeedback(emit, {
            uuid: `stop-${i}`,
            timestamp: c.hookTs,
            text: `HOOK-${i}`,
          });
        });
        act(() => {
          emit(MessageType.CLI_EVENT, {
            type: 'user',
            uuid: `turn-${i}`,
            timestamp: c.turnTs,
            message: { role: 'user', content: `TURN-${i}` },
          });
        });
      });

      // 훅 피드백이 끝에 몰리지 않고 각 사이클 사이에 번갈아 놓인다.
      expect(result.current.messages.map(m => m.message?.content)).toEqual([
        'HOOK-0', 'TURN-0', 'HOOK-1', 'TURN-1', 'HOOK-2', 'TURN-2',
      ]);
    });

    it('이후 델타가 훅 피드백을 아래로 밀지 않는다', () => {
      const { bridge, emit } = createMockBridge();
      const { result } = renderHook(() => useChatStream({ bridge }));

      act(() => {
        result.current.addUserMessage('go');
      });
      act(() => {
        emit(MessageType.CLI_EVENT, {
          type: 'stream_event',
          event: { delta: { type: 'text_delta', text: 'part one ' } },
        });
      });
      act(() => flushRAF());

      const assistantIndex = 1;
      const beforeText = getTextContent(result.current.messages[assistantIndex]);

      // 턴이 아직 스트리밍 중인데 훅 피드백이 도착한다.
      act(() => {
        emitStopHookFeedback(emit, {
          uuid: 'stop-mid',
          timestamp: new Date(Date.now() + 1000).toISOString(),
        });
      });
      const hookIndex = result.current.messages.length - 1;
      expect(getTextContent(result.current.messages[hookIndex])).toBe(STOP_HOOK_TEXT);

      // 응답이 계속 스트리밍된다.
      act(() => {
        emit(MessageType.CLI_EVENT, {
          type: 'stream_event',
          event: { delta: { type: 'text_delta', text: 'part two' } },
        });
      });
      act(() => flushRAF());

      // 훅 피드백 위 버블은 더 이상 자라지 않고, 새 텍스트는 그 아래에 쌓인다.
      expect(getTextContent(result.current.messages[assistantIndex])).toBe(beforeText);
      expect(getTextContent(result.current.messages[hookIndex])).toBe(STOP_HOOK_TEXT);
      const after = result.current.messages.slice(hookIndex + 1);
      expect(after.length).toBeGreaterThan(0);
      expect(getTextContent(after[after.length - 1])).toContain('part two');
    });

    it('tool_result는 자기 버블이 없으므로 assistant 버블을 쪼개지 않는다', () => {
      const { bridge, emit } = createMockBridge();
      const { result } = renderHook(() => useChatStream({ bridge }));

      act(() => {
        result.current.addUserMessage('go');
      });
      act(() => {
        emit(MessageType.CLI_EVENT, {
          type: 'stream_event',
          event: { delta: { type: 'text_delta', text: 'part one ' } },
        });
      });
      act(() => flushRAF());

      const assistantIndex = 1;
      expect(result.current.isStreaming).toBe(true);

      // 도구 결과가 도착해도 스트리밍은 계속되어야 한다.
      act(() => {
        emit(MessageType.CLI_EVENT, {
          type: 'user',
          uuid: 'tr-1',
          timestamp: new Date(Date.now() + 1000).toISOString(),
          message: {
            role: 'user',
            content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'ok' }],
          },
        });
      });

      expect(result.current.isStreaming).toBe(true);

      // 이후 델타는 원래 버블에 계속 누적된다 (새 버블로 갈라지지 않는다).
      act(() => {
        emit(MessageType.CLI_EVENT, {
          type: 'stream_event',
          event: { delta: { type: 'text_delta', text: 'part two' } },
        });
      });
      act(() => flushRAF());

      expect(getTextContent(result.current.messages[assistantIndex])).toContain('part one');
      expect(getTextContent(result.current.messages[assistantIndex])).toContain('part two');
    });
  });

  // Commands the CLI only accepts as a control_request are not turns: the CLI
  // answers once with a control_response and never sends the `result` that ends
  // a turn. Echoing them through addUserMessage left a placeholder spinning
  // forever (#270).
  describe('control_request 슬래시 커맨드 (#270)', () => {
    it('addCommandEcho는 진행 표시를 켜되 result를 기다리는 자리표시자는 만들지 않는다', () => {
      const { bridge } = createMockBridge();
      const { result } = renderHook(() => useChatStream({ bridge }));

      act(() => {
        result.current.addCommandEcho('/reload-plugins');
      });

      expect(result.current.messages).toHaveLength(1);
      expect(result.current.messages[0].type).toBe(LoadedMessageType.User);
      expect(getTextContent(result.current.messages[0])).toBe('/reload-plugins');
      // Spins while the CLI works — the command is running, and that should show.
      expect(result.current.isStreaming).toBe(true);
      // But with no message bound to `result`, which never arrives for a
      // control_request. The control_response is what ends it.
      expect(result.current.streamingMessageId).toBeNull();
    });

    it('control_response가 오면 진행 표시가 꺼진다', () => {
      const { bridge, emit } = createMockBridge();
      const { result } = renderHook(() => useChatStream({ bridge }));

      act(() => {
        result.current.addCommandEcho('/reload-plugins');
      });
      expect(result.current.isStreaming).toBe(true);

      act(() => {
        emit(MessageType.CLI_EVENT, {
          type: 'control_response',
          response: {
            subtype: 'success',
            request_id: 'ccg-cmd-reload_plugins-abc',
            response: { plugins: [{ name: 'omc' }], error_count: 0 },
          },
        });
      });

      expect(result.current.isStreaming).toBe(false);
    });

    it('control_response를 어시스턴트 메시지로 렌더한다', () => {
      const { bridge, emit } = createMockBridge();
      const { result } = renderHook(() => useChatStream({ bridge }));

      act(() => {
        result.current.addCommandEcho('/reload-plugins');
      });

      act(() => {
        emit(MessageType.CLI_EVENT, {
          type: 'control_response',
          response: {
            subtype: 'success',
            request_id: 'ccg-cmd-reload_plugins-abc',
            response: { plugins: [{ name: 'omc' }], error_count: 0 },
          },
        });
      });

      const last = result.current.messages[result.current.messages.length - 1];
      expect(last.type).toBe(LoadedMessageType.Assistant);
      expect(getTextContent(last)).toContain('omc');
      expect(result.current.isStreaming).toBe(false);
    });

    it('우리가 보내지 않은 control_response는 무시한다', () => {
      const { bridge, emit } = createMockBridge();
      const { result } = renderHook(() => useChatStream({ bridge }));

      act(() => {
        emit(MessageType.CLI_EVENT, {
          type: 'control_response',
          response: {
            subtype: 'success',
            request_id: 'can_use_tool_42',
            response: { behavior: 'allow' },
          },
        });
      });

      expect(result.current.messages).toHaveLength(0);
    });
  });

  // The live stream and the JSONL file disagree on spelling. The CLI writes the
  // marker to disk as `isApiErrorMessage`, but emits it on stdout as
  // `is_api_error_message` — same message, same uuid, two spellings. Reading only
  // the camelCase one dropped the marker on the live path, so
  // `isLimitErrorMessage()` returned false and the usage-limit notice rendered as
  // ordinary text with no auto-resume button. Reloading the session re-read the
  // JSONL and the button appeared, which is exactly the "works after refresh"
  // symptom that was reported.
  describe('API 오류 마커의 snake_case 표기 (자동재개 버튼)', () => {
    // 실제 CLI stdout에서 캡처한 사용량 한도 assistant 이벤트.
    const emitLimitNotice = (
      emit: (type: string, payload: Record<string, unknown>) => void,
    ) => {
      emit(MessageType.CLI_EVENT, {
        type: 'assistant',
        uuid: '563ce3f4-c5ed-4fb0-9bd2-3bcfbb1a1511',
        timestamp: '2026-08-18T17:41:12.737Z',
        session_id: '53b44151-c093-434e-8ef4-aaedca392ec3',
        parent_tool_use_id: null,
        error: 'rate_limit',
        is_api_error_message: true,
        message: {
          id: 'a084fc1d-595b-4575-bfff-d024f7754f27',
          role: 'assistant',
          model: '<synthetic>',
          type: 'message',
          stop_reason: 'stop_sequence',
          content: [
            { type: 'text', text: "You've hit your session limit · resets 5:10am (Asia/Seoul)" },
          ],
        },
      });
    };

    it('snake_case로 온 is_api_error_message를 마커로 보존한다', () => {
      const { bridge, emit } = createMockBridge();
      const { result } = renderHook(() => useChatStream({ bridge }));

      act(() => emitLimitNotice(emit));

      const last = result.current.messages[result.current.messages.length - 1];
      expect(last.isApiErrorMessage).toBe(true);
      expect(last.error).toBe('rate_limit');
    });

    it('보존된 마커로 사용량 한도 메시지가 식별된다', () => {
      const { bridge, emit } = createMockBridge();
      const { result } = renderHook(() => useChatStream({ bridge }));

      act(() => emitLimitNotice(emit));

      const last = result.current.messages[result.current.messages.length - 1];
      // 이 판정이 false면 LimitReachedRenderer로 라우팅되지 않아 버튼이 뜰 수 없다.
      expect(isLimitErrorMessage(last)).toBe(true);
    });

    it('camelCase로 오던 기존 표기도 계속 동작한다', () => {
      const { bridge, emit } = createMockBridge();
      const { result } = renderHook(() => useChatStream({ bridge }));

      act(() => {
        emit(MessageType.CLI_EVENT, {
          type: 'assistant',
          uuid: 'camel-1',
          isApiErrorMessage: true,
          apiErrorStatus: 429,
          error: 'rate_limit',
          message: {
            id: 'msg-camel',
            role: 'assistant',
            content: [{ type: 'text', text: "You've hit your session limit · resets 5:10am" }],
          },
        });
      });

      const last = result.current.messages[result.current.messages.length - 1];
      expect(last.isApiErrorMessage).toBe(true);
      expect(last.apiErrorStatus).toBe(429);
      expect(isLimitErrorMessage(last)).toBe(true);
    });

    it('인증 실패도 같은 경로로 마커가 보존된다', () => {
      const { bridge, emit } = createMockBridge();
      const { result } = renderHook(() => useChatStream({ bridge }));

      act(() => {
        emit(MessageType.CLI_EVENT, {
          type: 'assistant',
          uuid: 'auth-1',
          error: 'authentication_failed',
          is_api_error_message: true,
          api_error_status: 401,
          message: {
            id: 'msg-auth',
            role: 'assistant',
            content: [{ type: 'text', text: 'Failed to authenticate' }],
          },
        });
      });

      const last = result.current.messages[result.current.messages.length - 1];
      expect(last.isApiErrorMessage).toBe(true);
      expect(last.apiErrorStatus).toBe(401);
      expect(isAuthErrorMessage(last)).toBe(true);
    });

    it('마커가 없는 평범한 응답은 한도 메시지로 오인되지 않는다', () => {
      const { bridge, emit } = createMockBridge();
      const { result } = renderHook(() => useChatStream({ bridge }));

      act(() => {
        emit(MessageType.CLI_EVENT, {
          type: 'assistant',
          uuid: 'plain-1',
          message: {
            id: 'msg-plain',
            role: 'assistant',
            content: [{ type: 'text', text: "You've hit your session limit · resets 5:10am" }],
          },
        });
      });

      const last = result.current.messages[result.current.messages.length - 1];
      expect(last.isApiErrorMessage).toBeUndefined();
      expect(isLimitErrorMessage(last)).toBe(false);
    });
  });
});

/**
 * A turn that runs tools does not end at `result`: the CLI keeps going and
 * emits a NEW assistant message per continuation, each with its own
 * `message.id`. The streaming placeholder, however, lives until `result`.
 *
 * Both messages therefore resolved to the same placeholder, and the second
 * payload replaced the first one's blocks instead of following them — taking
 * that turn's `tool_use` with it. The matching `tool_result` still arrived,
 * found no tool call to fold into, and rendered as a bubble with nothing in it,
 * one per overwritten turn (issue #232).
 *
 * The session logs attached to the issue are what pinned this down: streamed,
 * 14 standalone tool_results whose tool_use_id matched none of the 236 tool_use
 * blocks present; reloaded, the same 14 ids all present, each on its own
 * assistant entry. Same data, so nothing was lost in transport — only the live
 * assembly collapsed them.
 */
describe('useChatStream — one assistant entry per CLI message id (issue #232)', () => {
  function toolUseIdsIn(messages: LoadedMessage[]): string[] {
    return messages.flatMap(m => {
      const content = m.message?.content;
      if (!Array.isArray(content)) return [];
      return content
        .filter((b): b is typeof b & { id: string } => b.type === 'tool_use')
        .map(b => b.id);
    });
  }

  /**
   * Streams one assistant turn that calls a single tool, as the CLI does.
   *
   * `content_block_start` matters as much as the payload: it is what opens the
   * streaming placeholder, and the overwrite only happens while one is open. A
   * turn built from `message_start` + the final payload alone never reproduced
   * the bug, because the placeholder was already closed and the second turn
   * took the append path regardless.
   */
  function emitToolTurn(
    emit: (type: string, payload: Record<string, unknown>) => void,
    apiMessageId: string,
    toolUseId: string,
  ) {
    emit(MessageType.CLI_EVENT, {
      type: 'stream_event',
      event: { type: 'message_start', message: { id: apiMessageId } },
    });
    emit(MessageType.CLI_EVENT, {
      type: 'stream_event',
      event: {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'tool_use', id: toolUseId, name: 'Bash', input: {} },
      },
    });
    emit(MessageType.CLI_EVENT, {
      type: 'assistant',
      message: {
        id: apiMessageId,
        role: 'assistant',
        content: [{ type: 'tool_use', id: toolUseId, name: 'Bash', input: { command: 'ls' } }],
      },
    });
  }

  /**
   * A full turn: text streamed as deltas and confirmed by a payload, then a
   * tool call under the SAME message id — the shape the session logs show, where
   * one id spans several `assistant` events.
   */
  function emitTextThenToolTurn(
    emit: (type: string, payload: Record<string, unknown>) => void,
    apiMessageId: string,
    text: string,
    toolUseId: string,
  ) {
    emit(MessageType.CLI_EVENT, {
      type: 'stream_event',
      event: { type: 'message_start', message: { id: apiMessageId } },
    });
    emit(MessageType.CLI_EVENT, {
      type: 'stream_event',
      event: { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    });
    emit(MessageType.CLI_EVENT, {
      type: 'stream_event',
      event: { delta: { type: 'text_delta', text } },
    });
    flushRAF();
    emit(MessageType.CLI_EVENT, {
      type: 'assistant',
      message: { id: apiMessageId, role: 'assistant', content: [{ type: 'text', text }] },
    });
    emit(MessageType.CLI_EVENT, {
      type: 'stream_event',
      event: {
        type: 'content_block_start',
        index: 1,
        content_block: { type: 'tool_use', id: toolUseId, name: 'Bash', input: {} },
      },
    });
    emit(MessageType.CLI_EVENT, {
      type: 'assistant',
      message: {
        id: apiMessageId,
        role: 'assistant',
        content: [
          { type: 'text', text },
          { type: 'tool_use', id: toolUseId, name: 'Bash', input: { command: 'ls' } },
        ],
      },
    });
  }

  it('keeps an earlier turn\'s tool_use when the next turn arrives', () => {
    const { bridge, emit } = createMockBridge();
    const { result } = renderHook(() => useChatStream({ bridge }));

    // One `act`, as the CLI delivers it: the turns arrive back to back with no
    // render committed in between, which is the state the placeholder is open
    // in. Splitting them across two `act` calls lets React close the stream
    // first, and then the second turn appends no matter what — the bug cannot
    // reproduce and the test proves nothing.
    act(() => {
      emitToolTurn(emit, 'msg_first', 'toolu_first');
      emitToolTurn(emit, 'msg_second', 'toolu_second');
      flushRAF();
    });

    // Before the fix the second payload overwrote the first, leaving only
    // `toolu_second` — and stranding `toolu_first`'s result as an empty bubble.
    expect(toolUseIdsIn(result.current.messages)).toEqual(['toolu_first', 'toolu_second']);
  });

  it('gives each CLI message id its own entry, so a tool_result finds its call', () => {
    const { bridge, emit } = createMockBridge();
    const { result } = renderHook(() => useChatStream({ bridge }));

    // Five continuations of one turn, the shape the reported session had.
    const ids = ['a', 'b', 'c', 'd', 'e'];
    act(() => {
      ids.forEach(id => emitToolTurn(emit, `msg_${id}`, `toolu_${id}`));
      flushRAF();
    });

    expect(toolUseIdsIn(result.current.messages)).toEqual(ids.map(id => `toolu_${id}`));

    // Every tool_result now has a tool_use to fold into — the property whose
    // absence *is* the empty bubble.
    const present = new Set(toolUseIdsIn(result.current.messages));
    ids.forEach(id => expect(present.has(`toolu_${id}`)).toBe(true));
  });

  it('does not repeat text when a message spans several assistant events', () => {
    // The first attempt at this fix sealed on the `assistant` payload instead of
    // `message_start`. By then the message's deltas were already in the entry,
    // so the next payload re-added the same text under a fresh entry and every
    // line of the reply appeared twice on screen. Sealing on `message_start` —
    // before any delta of the new message arrives — is what keeps each block in
    // exactly one entry.
    const { bridge, emit } = createMockBridge();
    const { result } = renderHook(() => useChatStream({ bridge }));

    act(() => {
      emitTextThenToolTurn(emit, 'msg_first', 'HELLO', 'toolu_first');
      emitTextThenToolTurn(emit, 'msg_second', 'WORLD', 'toolu_second');
      flushRAF();
    });

    const texts = result.current.messages.flatMap(m => {
      const content = m.message?.content;
      if (!Array.isArray(content)) return [];
      return content
        .filter((b): b is typeof b & { text: string } => b.type === 'text')
        .map(b => b.text)
        .filter(t => t !== '');
    });

    expect(texts).toEqual(['HELLO', 'WORLD']);
    // Both tool calls survive too — the defect this fix exists for.
    expect(toolUseIdsIn(result.current.messages)).toEqual(['toolu_first', 'toolu_second']);
  });

  it('does not split a turn whose deltas keep arriving under one message id', () => {
    // The seal keys on the id CHANGING, not on every assistant event. Text
    // deltas and their final payload all carry one id, and splitting there
    // would scatter a single reply across several bubbles.
    const { bridge, emit } = createMockBridge();
    const { result } = renderHook(() => useChatStream({ bridge }));

    act(() => {
      emit(MessageType.CLI_EVENT, {
        type: 'stream_event',
        event: { type: 'message_start', message: { id: 'msg_same' } },
      });
      emit(MessageType.CLI_EVENT, {
        type: 'stream_event',
        event: { delta: { type: 'text_delta', text: 'first' } },
      });
      emit(MessageType.CLI_EVENT, {
        type: 'stream_event',
        event: { delta: { type: 'text_delta', text: ' and second' } },
      });
      emit(MessageType.CLI_EVENT, {
        type: 'assistant',
        message: {
          id: 'msg_same',
          role: 'assistant',
          content: [{ type: 'text', text: 'first and second' }],
        },
      });
      flushRAF();
    });

    const assistantEntries = result.current.messages.filter(
      m => m.type === LoadedMessageType.Assistant,
    );
    expect(assistantEntries).toHaveLength(1);
    expect(getTextContent(assistantEntries[0] as LoadedMessageDto)).toContain('first and second');
  });
});
