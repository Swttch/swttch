import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TranscriptHeldMessages } from '../TranscriptHeldMessages';

// #673: messages written under a permission card, drawn as the desktop app draws them.
let heldMessages: Array<{ id: string; content: string }> = [];
const sendHeldMessage = vi.fn();
vi.mock('@/contexts/ChatStreamContext', () => ({
  useChatStreamContext: () => ({ heldMessages, sendHeldMessage }),
}));

beforeEach(() => {
  heldMessages = [];
  sendHeldMessage.mockClear();
});

describe('TranscriptHeldMessages', () => {
  it('draws nothing when nothing is held', () => {
    const { container } = render(<TranscriptHeldMessages />);
    expect(container).toBeEmptyDOMElement();
  });

  it('draws every held message, in order, and offers "Send now" under the first one only', () => {
    heldMessages = [
      { id: 'a', content: 'first' },
      { id: 'b', content: 'second' },
    ];
    const { container } = render(<TranscriptHeldMessages />);

    const bubbles = container.querySelectorAll('[data-transcript-held-message]');
    expect(bubbles).toHaveLength(2);
    expect(bubbles[0]).toHaveTextContent('first');
    expect(bubbles[1]).toHaveTextContent('second');
    expect(screen.getAllByTestId('held-message-send-now')).toHaveLength(1);
    expect(bubbles[0].querySelector('[data-testid="held-message-send-now"]')).not.toBeNull();
    expect(bubbles[1].querySelector('[data-testid="held-message-send-now"]')).toBeNull();
  });

  it('"Send now" sends that one message', () => {
    heldMessages = [{ id: 'a', content: 'first' }];
    render(<TranscriptHeldMessages />);
    fireEvent.click(screen.getByTestId('held-message-send-now'));
    expect(sendHeldMessage).toHaveBeenCalledWith('a');
  });
});
