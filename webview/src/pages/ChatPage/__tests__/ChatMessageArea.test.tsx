import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { ChatMessageArea } from '../ChatMessageArea';
import type { LoadedMessageDto } from '../../../types';
import { LoadedMessageType, MessageRole } from '../../../dto/common';
import { _resetRuntimeCache } from '@/config/environment';
import { mergeToolResults } from '../mergeToolResults';

// Mock contexts
const mockSessionContext = {
  workingDirectory: null as string | null,
  setWorkingDirectory: vi.fn(),
};

const mockChatStreamContext = {
  messages: [] as LoadedMessageDto[],
  retry: vi.fn(),
};

vi.mock('../../../contexts/SessionContext', () => ({
  useSessionContext: () => mockSessionContext,
}));

// The send menu's rewind entry talks to the backend through the bridge
// (issue #356). These tests only render the menu, so a stub is enough.
vi.mock('@/contexts/BridgeContext', () => ({
  useBridgeContext: () => ({ send: vi.fn().mockResolvedValue({ status: 'ok' }) }),
}));


vi.mock('../../../contexts/ChatStreamContext', () => ({
  useChatStreamContext: () => mockChatStreamContext,
}));

// Mock child components
vi.mock('../MessageBubble', () => ({
  MessageBubble: ({ message }: { message: LoadedMessageDto }) => (
    <div data-testid={`message-bubble-${message.uuid}`}>
      {message.type}: {typeof message.message?.content === 'string' ? message.message.content : 'complex content'}
    </div>
  ),
}));

vi.mock('@/pages/ProjectSelectorPage', () => ({
  ProjectSelectorPage: () => <div data-testid="project-selector">Select Project</div>,
}));

vi.mock('../EmptyState', () => ({
  EmptyState: () => <div data-testid="empty-state">Type a message</div>,
}));

const scrollContainerRef = React.createRef<HTMLDivElement>() as React.RefObject<HTMLDivElement | null>;

// The send menu reads the router to hand a fork off to the new session it opens
// (issue #356), so the area needs a router above it the way it has one in the app.
const renderWithScrollContainer = (ui: React.ReactElement) => {
  return render(
    <MemoryRouter>
      <div ref={scrollContainerRef as React.RefObject<HTMLDivElement>}>
        {ui}
      </div>
    </MemoryRouter>
  );
};

const renderArea = (isStreaming = false, hasMore = false, onLoadMore = vi.fn(), isLoadingMore = false) => {
  const merged = mergeToolResults(mockChatStreamContext.messages);
  return renderWithScrollContainer(
    <ChatMessageArea
      isStreaming={isStreaming}
      mergedMessages={merged}
      hasMore={hasMore}
      isLoadingMore={isLoadingMore}
      onLoadMore={onLoadMore}
    />
  );
};

describe('ChatMessageArea', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock scrollIntoView
    Element.prototype.scrollIntoView = vi.fn();
    // Clear JCEF detection and runtime cache
    delete (window as any).cefQuery_test_1;
    _resetRuntimeCache();
    // Reset context defaults
    mockSessionContext.workingDirectory = null;
    mockChatStreamContext.messages = [];
  });

  it('shows ProjectSelector when no working directory in browser environment', () => {
    renderArea();

    expect(screen.getByTestId('project-selector')).toBeInTheDocument();
    expect(screen.getByText('Select Project')).toBeInTheDocument();
  });

  it('shows loading message when no working directory in JCEF environment', () => {
    // JCEF 환경 시뮬레이션: cefQuery_* non-enumerable 함수 존재
    Object.defineProperty(window, 'cefQuery_test_1', {
      value: () => {},
      configurable: true,
    });

    renderArea();

    expect(screen.getByText('Loading working directory...')).toBeInTheDocument();
    expect(screen.queryByTestId('project-selector')).not.toBeInTheDocument();
  });

  it('shows empty state message when no messages with working directory', () => {
    mockSessionContext.workingDirectory = '/test/path';

    renderArea();

    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
  });

  it('renders user message correctly', () => {
    mockSessionContext.workingDirectory = '/test/path';
    mockChatStreamContext.messages = [{
      uuid: 'msg1',
      type: LoadedMessageType.User,
      message: { role: MessageRole.User, content: 'Hello, assistant!' },
      timestamp: new Date().toISOString(),
    }];

    renderArea();

    expect(screen.getByTestId('message-bubble-msg1')).toBeInTheDocument();
    expect(screen.getByText('user: Hello, assistant!')).toBeInTheDocument();
  });

  it('renders assistant message correctly', () => {
    mockSessionContext.workingDirectory = '/test/path';
    mockChatStreamContext.messages = [{
      uuid: 'msg2',
      type: LoadedMessageType.Assistant,
      message: { role: MessageRole.Assistant, content: 'Hello, user!' },
      timestamp: new Date().toISOString(),
    }];

    renderArea();

    expect(screen.getByTestId('message-bubble-msg2')).toBeInTheDocument();
    expect(screen.getByText('assistant: Hello, user!')).toBeInTheDocument();
  });

  it('renders ToolCard for messages with toolUses in content blocks', () => {
    mockSessionContext.workingDirectory = '/test/path';
    mockChatStreamContext.messages = [{
      uuid: 'msg3',
      type: LoadedMessageType.Assistant,
      message: {
        role: MessageRole.Assistant,
        content: [
          { type: 'text', text: 'I need to read a file' },
          { type: 'tool_use', id: 'tool1', name: 'read_file', input: { path: '/test.txt' } },
        ] as any,
      },
      timestamp: new Date().toISOString(),
    }];

    renderArea();

    expect(screen.getByTestId('message-bubble-msg3')).toBeInTheDocument();
  });

  it('renders multiple messages correctly', () => {
    const now = new Date().toISOString();
    mockSessionContext.workingDirectory = '/test/path';
    mockChatStreamContext.messages = [
      {
        uuid: 'msg1',
        type: LoadedMessageType.User,
        message: { role: MessageRole.User, content: 'First message' },
        timestamp: now,
      },
      {
        uuid: 'msg2',
        type: LoadedMessageType.Assistant,
        message: { role: MessageRole.Assistant, content: 'Second message' },
        timestamp: now,
      },
      {
        uuid: 'msg3',
        type: LoadedMessageType.User,
        message: { role: MessageRole.User, content: 'Third message' },
        timestamp: now,
      },
    ];

    renderArea();

    expect(screen.getByTestId('message-bubble-msg1')).toBeInTheDocument();
    expect(screen.getByTestId('message-bubble-msg2')).toBeInTheDocument();
    expect(screen.getByTestId('message-bubble-msg3')).toBeInTheDocument();
    expect(screen.getByText('user: First message')).toBeInTheDocument();
    expect(screen.getByText('assistant: Second message')).toBeInTheDocument();
    expect(screen.getByText('user: Third message')).toBeInTheDocument();
  });

  it('renders multiple tool uses for a single message', () => {
    mockSessionContext.workingDirectory = '/test/path';
    mockChatStreamContext.messages = [{
      uuid: 'msg4',
      type: LoadedMessageType.Assistant,
      message: {
        role: MessageRole.Assistant,
        content: [
          { type: 'text', text: 'Using multiple tools' },
          { type: 'tool_use', id: 'tool1', name: 'read_file', input: { path: '/test1.txt' } },
          { type: 'tool_use', id: 'tool2', name: 'write_file', input: { path: '/test2.txt' } },
        ] as any,
      },
      timestamp: new Date().toISOString(),
    }];

    renderArea();

    expect(screen.getByTestId('message-bubble-msg4')).toBeInTheDocument();
  });
});
