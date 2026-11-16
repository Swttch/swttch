import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/pages/ChatPage/ThinkingStreamingMessage.tsx', () => ({
  ThinkingStreamingMessage: ({ thinking }: { thinking: string }) => <div data-testid="thinking-block">{thinking}</div>,
}));

vi.mock('../../StreamingMessage', () => ({
  StreamingMessage: ({ content }: { content: string }) => <div data-testid="text-block">{content}</div>,
}));

import { AssistantMessageRenderer } from '../AssistantMessageRenderer';
import { LoadedMessageDto } from '../../../../types';
import { LoadedMessageType, MessageRole } from '../../../../dto/common';
import { ContentBlockType } from '../../../../dto/message/ContentBlockDto';

/**
 * A reply being streamed takes over the uuid of each finished block's session entry (see `rowKey`). Its
 * thinking and text blocks have to stay the same elements through that, not be built again from scratch at
 * every rename of the reply they belong to.
 */
describe('AssistantMessageRenderer block keys', () => {
  const reply = (uuid: string, text: string) => ({
    type: LoadedMessageType.Assistant,
    uuid,
    rowKey: 'placeholder-1',
    isStreaming: true,
    message: {
      role: MessageRole.Assistant,
      content: [
        { type: ContentBlockType.Thinking, thinking: 'Reading the file first.' },
        { type: ContentBlockType.Text, text },
      ],
    },
  }) as unknown as LoadedMessageDto;

  it('keeps the thinking and text blocks when the streamed reply takes a new uuid', () => {
    const { rerender } = render(<AssistantMessageRenderer message={reply('entry-thinking', 'Editing')} />);
    const thinking = screen.getByTestId('thinking-block');
    const text = screen.getByTestId('text-block');

    rerender(<AssistantMessageRenderer message={reply('entry-text', 'Editing it now.')} />);

    expect(screen.getByTestId('text-block').textContent).toBe('Editing it now.');
    expect(screen.getByTestId('thinking-block')).toBe(thinking);
    expect(screen.getByTestId('text-block')).toBe(text);
  });
});
