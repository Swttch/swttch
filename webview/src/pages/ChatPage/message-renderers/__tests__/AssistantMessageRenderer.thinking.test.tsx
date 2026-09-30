import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/pages/ChatPage/ThinkingStreamingMessage.tsx', () => ({
  ThinkingStreamingMessage: ({ thinking, durationMillis }: { thinking: string; durationMillis?: number }) => (
    <div data-testid="thinking-block" data-duration={durationMillis}>{thinking}</div>
  ),
}));

import { AssistantMessageRenderer } from '../AssistantMessageRenderer';
import { LoadedMessageDto } from '../../../../types';
import { LoadedMessageType, MessageRole } from '../../../../dto/common';
import { ContentBlockType } from '../../../../dto/message/ContentBlockDto';

/**
 * A live response that split one stretch of thinking into an empty block and a
 * text block arrives as one message holding both (#496). It must draw as one
 * thinking block, timed by both.
 */
describe('AssistantMessageRenderer thinking', () => {
  it('draws a response\'s split thinking as a single block', () => {
    const message = {
      type: LoadedMessageType.Assistant,
      uuid: 'm1',
      message: {
        role: MessageRole.Assistant,
        content: [
          { type: ContentBlockType.Thinking, thinking: '', durationMillis: 5000 },
          { type: ContentBlockType.Thinking, thinking: 'Checking the log first.', durationMillis: 40 },
        ],
      },
    } as unknown as LoadedMessageDto;

    render(<AssistantMessageRenderer message={message} />);

    const blocks = screen.getAllByTestId('thinking-block');
    expect(blocks).toHaveLength(1);
    expect(blocks[0].textContent).toBe('Checking the log first.');
    expect(blocks[0].dataset.duration).toBe('5040');
  });
});
