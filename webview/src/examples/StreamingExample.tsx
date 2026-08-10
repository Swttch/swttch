import React from 'react';
import { useChatStreamContext } from '../contexts/ChatStreamContext';
import { useChatInputState } from '../contexts/ChatInputStateContext';
import { MessageRole, LoadedMessageType } from '../dto/common';
import { InputModeValues } from '../types/chatInput';

/**
 * Example component demonstrating streaming message integration
 * using the new ChatStreamContext.
 */
export const StreamingExample: React.FC = () => {
  const {
    messages,
    isStreaming,
    streamingMessageId,
    handleSubmit,
    stop,
    error,
  } = useChatStreamContext();
  const { input, setInput } = useChatInputState();

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Status bar */}
      <div style={{ padding: '1rem', borderBottom: '1px solid var(--ide-border)' }}>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <div>
            <strong>Streaming:</strong> {isStreaming ? 'Yes' : 'No'}
          </div>
          {streamingMessageId && (
            <div>
              <strong>Current Message:</strong> {streamingMessageId}
            </div>
          )}
          {isStreaming && (
            <button onClick={stop} style={{ padding: '0.5rem 1rem', cursor: 'pointer' }}>
              Stop
            </button>
          )}
        </div>
        {error && (
          <div style={{ marginTop: '0.5rem', color: 'red' }}>
            Error: {error.message}
          </div>
        )}
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflow: 'auto', padding: '1rem' }}>
        {messages.map((msg) => (
          <div key={msg.uuid} style={{ marginBottom: '1rem' }}>
            <strong>{msg.type}:</strong> {typeof msg.message?.content === 'string' ? msg.message.content : '[ContentBlocks]'}
            {msg.isStreaming && <span> (streaming...)</span>}
          </div>
        ))}
      </div>

      {/* Input */}
      <form onSubmit={(e) => handleSubmit(e, InputModeValues.ASK_BEFORE_EDIT)} style={{ padding: '1rem', borderTop: '1px solid var(--ide-border)', display: 'flex', gap: '0.5rem' }}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message..."
          disabled={isStreaming}
          style={{ flex: 1, padding: '0.75rem' }}
        />
        <button type="submit" disabled={isStreaming || !input.trim()} style={{ padding: '0.75rem 1.5rem' }}>
          {isStreaming ? 'Sending...' : 'Send'}
        </button>
      </form>

      {/* Debug */}
      <div style={{ padding: '0.5rem 1rem', fontSize: '0.75rem', display: 'flex', justifyContent: 'space-between' }}>
        <span>Messages: {messages.length}</span>
        <span>Streaming: {streamingMessageId || 'None'}</span>
      </div>
    </div>
  );
};

export const mockStreamingData = {
  messages: [
    {
      type: LoadedMessageType.User,
      uuid: 'msg-1',
      timestamp: new Date(Date.now() - 60000).toISOString(),
      message: { role: MessageRole.User, content: 'Hello! Can you explain React hooks?' },
    },
    {
      type: LoadedMessageType.Assistant,
      uuid: 'msg-2',
      timestamp: new Date(Date.now() - 59000).toISOString(),
      message: { role: MessageRole.Assistant, content: '# React Hooks\n\nReact Hooks are functions...' },
      isStreaming: false,
    },
  ],
};
