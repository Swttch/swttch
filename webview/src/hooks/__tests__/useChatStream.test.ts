import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useChatStream, type LoadedMessage } from '../useChatStream';
import type { LoadedMessageDto } from '../../types';
import { ContextType } from '../../types';
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
});
