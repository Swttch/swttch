import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { SessionMetaDto } from '../session/SessionDto';
import {
  UserMessageDto,
  AssistantMessageDto,
  SystemMessageDto,
  ResultMessageDto,
} from '../message/MessageDto';
import {
  TextBlockDto,
  ToolUseBlockDto,
  ContentBlockType,
} from '../message/ContentBlockDto';
import {
  TextDeltaDto,
  ToolUseDeltaDto,
  ContentBlockDeltaMessageDto,
} from '../stream/StreamEventDto';

describe('DTO Transformation', () => {
  describe('SessionMetaDto', () => {
    it('should transform plain object to SessionMetaDto', () => {
      const plain = {
        sessionId: 'sess-123',
        title: 'Hello world session',
        createdAt: '2025-01-01T00:00:00Z',
        lastTimestamp: '2025-01-01T12:00:00Z',
        messageCount: 10,
        isSidechain: false,
      };
      const instance = plainToInstance(SessionMetaDto, plain);
      expect(instance).toBeInstanceOf(SessionMetaDto);
      expect(instance.messageCount).toBe(10);
      expect(instance.isSidechain).toBe(false);
    });

    it('should use defaults for missing fields', () => {
      const plain = {
        sessionId: 'sess-123',
        title: 'Test',
        createdAt: '2025-01-01T00:00:00Z',
      };
      const instance = plainToInstance(SessionMetaDto, plain);
      // Absent means "the backend did not count", which is null rather than 0 —
      // a session with zero entries and a session nobody counted are different
      // facts and must not collapse onto the same value.
      expect(instance.messageCount).toBeNull();
      expect(instance.isSidechain).toBe(false);
    });
  });

  describe('UserMessageDto', () => {
    it('should transform user message with content blocks', () => {
      const plain = {
        type: 'user',
        message: {
          role: 'user',
          content: [{ type: 'text', text: 'Hello' }],
        },
        timestamp: '2025-01-01T00:00:00Z',
      };
      const instance = plainToInstance(UserMessageDto, plain);
      expect(instance).toBeInstanceOf(UserMessageDto);
      expect(instance.timestamp).toBe('2025-01-01T00:00:00Z');
    });
  });

  describe('AssistantMessageDto', () => {
    it('should transform assistant message', () => {
      const plain = {
        type: 'assistant',
        sessionId: 'sess-1',
        messageId: 'msg-1',
        content: [{ type: 'text', text: 'Response' }],
      };
      const instance = plainToInstance(AssistantMessageDto, plain);
      expect(instance).toBeInstanceOf(AssistantMessageDto);
      expect(instance.sessionId).toBe('sess-1');
      expect(instance.messageId).toBe('msg-1');
    });
  });

  describe('SystemMessageDto', () => {
    it('should transform system message', () => {
      const plain = {
        type: 'system',
        session_id: 'sess-1',
        timestamp: '2025-01-01T00:00:00Z',
        content: 'Session initialized',
      };
      const instance = plainToInstance(SystemMessageDto, plain);
      expect(instance).toBeInstanceOf(SystemMessageDto);
      expect(instance.content).toBe('Session initialized');
    });
  });

  describe('ResultMessageDto', () => {
    it('should transform success result', () => {
      const plain = {
        type: 'result',
        sessionId: 'sess-1',
        status: 'success',
        messageId: 'msg-1',
        usage: { input_tokens: 100, output_tokens: 50 },
      };
      const instance = plainToInstance(ResultMessageDto, plain);
      expect(instance).toBeInstanceOf(ResultMessageDto);
      expect(instance.status).toBe('success');
    });

    it('should transform error result', () => {
      const plain = {
        type: 'result',
        sessionId: 'sess-1',
        status: 'error',
        error: { code: 'rate_limit', message: 'Too many requests' },
      };
      const instance = plainToInstance(ResultMessageDto, plain);
      expect(instance.status).toBe('error');
    });
  });

  describe('Content Block DTOs', () => {
    it('should transform TextBlockDto', () => {
      const instance = plainToInstance(TextBlockDto, { type: 'text', text: 'Hello' });
      expect(instance).toBeInstanceOf(TextBlockDto);
      expect(instance.text).toBe('Hello');
      expect(instance.type).toBe(ContentBlockType.Text);
    });

    it('should transform ToolUseBlockDto', () => {
      const instance = plainToInstance(ToolUseBlockDto, {
        type: 'tool_use',
        id: 'tool_1',
        name: 'bash',
        input: { command: 'ls' },
      });
      expect(instance).toBeInstanceOf(ToolUseBlockDto);
      expect(instance.name).toBe('bash');
      expect(instance.input).toEqual({ command: 'ls' });
    });
  });

  describe('Stream Event DTOs', () => {
    it('should transform TextDeltaDto', () => {
      const instance = plainToInstance(TextDeltaDto, {
        type: 'text_delta',
        text: 'streaming text',
      });
      expect(instance).toBeInstanceOf(TextDeltaDto);
      expect(instance.text).toBe('streaming text');
    });

    it('should transform ToolUseDeltaDto', () => {
      const instance = plainToInstance(ToolUseDeltaDto, {
        type: 'tool_use_delta',
        id: 'tool_1',
        name: 'bash',
      });
      expect(instance).toBeInstanceOf(ToolUseDeltaDto);
      expect(instance.id).toBe('tool_1');
    });

    it('should transform ContentBlockDeltaMessageDto', () => {
      const instance = plainToInstance(ContentBlockDeltaMessageDto, {
        type: 'content_block_delta',
        sessionId: 'sess-1',
        event: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'hello' },
      });
      expect(instance).toBeInstanceOf(ContentBlockDeltaMessageDto);
      expect(instance.sessionId).toBe('sess-1');
      expect(instance.index).toBe(0);
    });
  });
});
