import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChatSearchBar } from '../ChatSearchBar';
import type { ChatSearch } from '../useChatSearch';

function fakeSearch(overrides: Partial<ChatSearch> = {}): ChatSearch {
  return {
    isOpen: true,
    focusNonce: 1,
    query: 'rollback',
    setQuery: vi.fn(),
    total: 9,
    truncated: false,
    current: 0,
    isLoadingHistory: false,
    open: vi.fn(),
    close: vi.fn(),
    next: vi.fn(),
    previous: vi.fn(),
    ...overrides,
  };
}

describe('ChatSearchBar', () => {
  it('draws nothing while closed', () => {
    const { container } = render(<ChatSearchBar search={fakeSearch({ isOpen: false })} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('takes focus when it opens', () => {
    render(<ChatSearchBar search={fakeSearch()} />);
    expect(screen.getByRole('textbox')).toHaveFocus();
  });

  it('shows where the current match is, or that there is none', () => {
    const { rerender } = render(<ChatSearchBar search={fakeSearch()} />);
    expect(screen.getByRole('search')).toHaveTextContent('1 of 9');
    rerender(<ChatSearchBar search={fakeSearch({ total: 0, current: 0 })} />);
    expect(screen.getByRole('search')).toHaveTextContent('No results');
  });

  it('marks a count the backend stopped at its limit', () => {
    render(<ChatSearchBar search={fakeSearch({ total: 2000, truncated: true })} />);
    expect(screen.getByRole('search')).toHaveTextContent('1 of 2000+');
  });

  it('does not say "no results" while older pages are still being searched', () => {
    render(<ChatSearchBar search={fakeSearch({ total: 0, isLoadingHistory: true })} />);
    expect(screen.getByRole('search')).not.toHaveTextContent('No results');
  });

  it('Enter goes to the next match, Shift+Enter to the previous, Escape closes', () => {
    const search = fakeSearch();
    render(<ChatSearchBar search={search} />);
    const input = screen.getByRole('textbox');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(search.next).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
    expect(search.previous).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(search.close).toHaveBeenCalledTimes(1);
  });

  it('leaves Enter alone while an input method is composing', () => {
    const search = fakeSearch();
    render(<ChatSearchBar search={search} />);
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter', isComposing: true });
    expect(search.next).not.toHaveBeenCalled();
  });

  it('is a zero-height sticky strip, so it never pushes the transcript or covers a banner', () => {
    const { container } = render(<ChatSearchBar search={fakeSearch()} />);
    const strip = container.firstElementChild as HTMLElement;
    expect(strip.className).toContain('sticky');
    expect(strip.className).toContain('h-0');
    expect(strip).toHaveAttribute('data-chat-search-skip');
  });
});
