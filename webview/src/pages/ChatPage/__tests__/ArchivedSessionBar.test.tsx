import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const setSessionArchived = vi.fn();
const resetToNewSession = vi.fn();
vi.mock('@/contexts/SessionContext', () => ({
  useSessionContext: () => ({ setSessionArchived, resetToNewSession }),
}));
vi.mock('@/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { ArchivedChatInputSlot, ArchivedSessionBar } from '../ArchivedSessionBar';

/** Stands where the chat input would be when the session is archived. */
describe('ArchivedSessionBar', () => {
  it('says the session is archived, and offers to bring it back', () => {
    render(<ArchivedSessionBar sessionId="s1" />);
    expect(screen.getByText('archivedSession.message')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'archivedSession.unarchive' }));
    expect(setSessionArchived).toHaveBeenCalledWith('s1', false);
  });

  it('offers a new session in this tab, to the left of unarchive', () => {
    render(<ArchivedSessionBar sessionId="s1" />);
    const buttons = screen.getAllByRole('button');
    expect(buttons.map((b) => b.textContent)).toEqual(['archivedSession.newSession', 'archivedSession.unarchive']);
    fireEvent.click(buttons[0]);
    expect(resetToNewSession).toHaveBeenCalledTimes(1);
  });

  it("fills the input's own column and is laid over the input's place", () => {
    render(<ArchivedSessionBar sessionId="s1" />);
    const bar = screen.getByTestId('archived-session-bar');
    expect(bar.className).toContain('absolute inset-0');
    const column = bar.firstElementChild as HTMLElement;
    expect(column.className).toContain('max-w-[var(--chat-column-max,44rem)]');
    expect(column.className).toContain('h-full');
    const box = column.firstElementChild as HTMLElement;
    expect(box.className).toContain('bg-surface-hover');
    expect(box.contains(screen.getByText('archivedSession.message'))).toBe(true);
  });
});

describe('ArchivedSessionBar Tab order', () => {
  it('puts new session, then unarchive, first in the page Tab order', () => {
    render(<ArchivedSessionBar sessionId="s1" />);
    expect(screen.getByRole('button', { name: 'archivedSession.newSession' })).toHaveAttribute('tabindex', '1');
    expect(screen.getByRole('button', { name: 'archivedSession.unarchive' })).toHaveAttribute('tabindex', '2');
  });
});

describe('ArchivedSessionBar focus', () => {
  it('puts the focus on the new-session button when the session was archived while open', () => {
    render(<ArchivedSessionBar sessionId="s1" focusNewSession />);
    expect(screen.getByRole('button', { name: 'archivedSession.newSession' })).toHaveFocus();
  });

  it('leaves the focus alone when an archived session is merely opened', () => {
    render(<ArchivedSessionBar sessionId="s1" />);
    expect(screen.getByRole('button', { name: 'archivedSession.newSession' })).not.toHaveFocus();
  });
});

describe('ArchivedChatInputSlot', () => {
  it('keeps the input mounted but hidden and shut to focus, with the bar laid over it', () => {
    render(
      <ArchivedChatInputSlot sessionId="s1">
        <input aria-label="the input" />
      </ArchivedChatInputSlot>,
    );
    const hidden = screen.getByLabelText('the input').parentElement as HTMLElement;
    expect(hidden.className).toContain('invisible');
    expect(hidden.hasAttribute('inert')).toBe(true);
    expect(hidden.getAttribute('aria-hidden')).toBe('true');
    expect(screen.getByTestId('archived-session-bar')).toBeInTheDocument();
  });
});
