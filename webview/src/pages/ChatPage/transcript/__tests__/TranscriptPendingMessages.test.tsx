import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TranscriptPendingMessages } from '../TranscriptPendingMessages';

// Messages written while a turn runs, which the CLI has not read yet, drawn as the desktop app draws them.
let sentWhileRunning: Array<{ id: string; uuid: string; content: string }> = [];
let pendingCancelSupported = true;
const cancelPendingMessage = vi.fn();
vi.mock('@/contexts/ChatStreamContext', () => ({
  useChatStreamContext: () => ({ sentWhileRunning, cancelPendingMessage, pendingCancelSupported }),
}));

beforeEach(() => {
  sentWhileRunning = [];
  pendingCancelSupported = true;
  cancelPendingMessage.mockClear();
});

describe('TranscriptPendingMessages', () => {
  it('draws nothing when nothing waits', () => {
    const { container } = render(<TranscriptPendingMessages />);
    expect(container).toBeEmptyDOMElement();
  });

  it('draws every waiting message in order, with the cross under each and no "Send now"', () => {
    sentWhileRunning = [
      { id: 'a', uuid: 'ua', content: 'first' },
      { id: 'b', uuid: 'ub', content: 'second' },
    ];
    const { container } = render(<TranscriptPendingMessages />);
    const bubbles = container.querySelectorAll('[data-pending-sent-message]');
    expect(bubbles).toHaveLength(2);
    expect(bubbles[0]).toHaveTextContent('first');
    expect(bubbles[1]).toHaveTextContent('second');
    expect(screen.queryByTestId('pending-message-send-now')).toBeNull();
    expect(container).not.toHaveTextContent('지금 보내기');

    const crosses = screen.getAllByTestId('pending-message-cancel');
    expect(crosses).toHaveLength(2);
    fireEvent.click(crosses[1]);
    expect(cancelPendingMessage).toHaveBeenCalledWith('b');
  });

  it('stops offering the cross once the CLI is known not to take a message back', () => {
    pendingCancelSupported = false;
    sentWhileRunning = [{ id: 'a', uuid: 'ua', content: 'first' }];
    render(<TranscriptPendingMessages />);
    expect(screen.queryByTestId('pending-message-cancel')).toBeNull();
  });
});
