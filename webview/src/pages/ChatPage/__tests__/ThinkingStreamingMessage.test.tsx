import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const toggleThinkingExpanded = vi.fn();
let isThinkingExpanded = false;

vi.mock('../../../contexts/ChatStreamContext', () => ({
  useChatStreamContext: () => ({ isThinkingExpanded, toggleThinkingExpanded }),
}));

import { ThinkingStreamingMessage } from '../ThinkingStreamingMessage';

/** The row that holds the "Thought for Ns" label. */
const labelRow = () => screen.getByText(/Thought for/).parentElement as HTMLElement;
const chevron = () => screen.queryByTestId('thinking-chevron');

beforeEach(() => {
  toggleThinkingExpanded.mockClear();
  isThinkingExpanded = false;
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
    expect(chevron()).toBeNull();
    fireEvent.click(labelRow());
    expect(toggleThinkingExpanded).not.toHaveBeenCalled();
  });

  it('is not clickable when the thinking text is only whitespace', () => {
    render(<ThinkingStreamingMessage thinking={'\n  \n'} isStreaming={false} durationMillis={3000} />);

    expect(labelRow().className).not.toContain('cursor-pointer');
    expect(chevron()).toBeNull();
    fireEvent.click(labelRow());
    expect(toggleThinkingExpanded).not.toHaveBeenCalled();
  });

  it('toggles the thinking text when the block has some', () => {
    render(<ThinkingStreamingMessage thinking="Checking the log first." isStreaming={false} durationMillis={3000} />);

    expect(labelRow().className).toContain('cursor-pointer');
    fireEvent.click(labelRow());
    expect(toggleThinkingExpanded).toHaveBeenCalledTimes(1);
  });

  it('shows a chevron beside the label that points down once expanded', () => {
    const { rerender } = render(
      <ThinkingStreamingMessage thinking="Checking the log first." isStreaming={false} durationMillis={3000} />,
    );
    expect(labelRow().contains(chevron())).toBe(true);
    expect(chevron()!.getAttribute('class')).not.toMatch(/(^|\s)rotate-90/);

    isThinkingExpanded = true;
    rerender(<ThinkingStreamingMessage thinking="Checking the log first." isStreaming={false} durationMillis={3000} />);
    expect(chevron()!.getAttribute('class')).toMatch(/(^|\s)rotate-90/);
  });
});
