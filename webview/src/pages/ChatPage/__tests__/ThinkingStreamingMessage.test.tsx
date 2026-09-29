import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const toggleThinkingExpanded = vi.fn();

vi.mock('../../../contexts/ChatStreamContext', () => ({
  useChatStreamContext: () => ({ isThinkingExpanded: false, toggleThinkingExpanded }),
}));

import { ThinkingStreamingMessage } from '../ThinkingStreamingMessage';

/** The row that holds the "Thought for Ns" label. */
const labelRow = () => screen.getByText(/Thought for/).parentElement as HTMLElement;

beforeEach(() => {
  toggleThinkingExpanded.mockClear();
});

/**
 * Models often stream a thinking block that carries no text. Expanding such a
 * block reveals nothing, so the label must not look or act clickable (#496).
 * Once any thinking text arrives, it goes back to being a toggle.
 */
describe('ThinkingStreamingMessage label', () => {
  it('is not clickable when the block has no thinking text', () => {
    render(<ThinkingStreamingMessage thinking="" isStreaming={false} durationMillis={3000} />);

    expect(labelRow().className).not.toContain('cursor-pointer');
    fireEvent.click(labelRow());
    expect(toggleThinkingExpanded).not.toHaveBeenCalled();
  });

  it('is not clickable when the thinking text is only whitespace', () => {
    render(<ThinkingStreamingMessage thinking={'\n  \n'} isStreaming={false} durationMillis={3000} />);

    expect(labelRow().className).not.toContain('cursor-pointer');
    fireEvent.click(labelRow());
    expect(toggleThinkingExpanded).not.toHaveBeenCalled();
  });

  it('toggles the thinking text when the block has some', () => {
    render(<ThinkingStreamingMessage thinking="Checking the log first." isStreaming={false} durationMillis={3000} />);

    expect(labelRow().className).toContain('cursor-pointer');
    fireEvent.click(labelRow());
    expect(toggleThinkingExpanded).toHaveBeenCalledTimes(1);
  });
});
