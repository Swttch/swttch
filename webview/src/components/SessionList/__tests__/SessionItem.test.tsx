import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SessionItem } from '../SessionItem';
import { SessionMetaDto } from '@/dto';

const createMockSession = (overrides: Partial<SessionMetaDto> = {}): SessionMetaDto => {
  return Object.assign(new SessionMetaDto(), {
    id: 'test-session-1',
    title: 'Test Session',
    createdAt: new Date('2026-03-20T10:00:00Z'),
    updatedAt: new Date('2026-03-20T11:00:00Z'),
    messageCount: 5,
    isSidechain: false,
    ...overrides,
  });
};

describe('SessionItem', () => {
  let onSelect: ReturnType<typeof vi.fn<() => void>>;
  let onDelete: ReturnType<typeof vi.fn<() => void>>;
  let onRename: ReturnType<typeof vi.fn<(title: string) => void>>;

  beforeEach(() => {
    onSelect = vi.fn<() => void>();
    onDelete = vi.fn<() => void>();
    onRename = vi.fn<(title: string) => void>();
  });

  const renderItem = (session: SessionMetaDto, isSelected = false) =>
    render(
      <SessionItem
        session={session}
        isSelected={isSelected}
        onSelect={onSelect}
        onDelete={onDelete}
        onRename={onRename}
      />
    );

  it('renders the session title', () => {
    renderItem(createMockSession({ title: 'My Session' }));
    expect(screen.getByText('My Session')).toBeDefined();
  });

  it('calls onSelect when the button is clicked', () => {
    renderItem(createMockSession());
    fireEvent.click(screen.getByRole('button', { name: /Test Session/i }));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('shows delete button on hover', () => {
    renderItem(createMockSession());
    expect(screen.queryByTitle('Delete session')).toBeNull();
    fireEvent.mouseEnter(screen.getByRole('button', { name: /Test Session/i }));
    expect(screen.getByTitle('Delete session')).toBeDefined();
  });

  it('calls onDelete when delete button is clicked', () => {
    renderItem(createMockSession());
    fireEvent.mouseEnter(screen.getByRole('button', { name: /Test Session/i }));
    fireEvent.click(screen.getByTitle('Delete session'));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('does not call onSelect when delete button is clicked', () => {
    renderItem(createMockSession());
    fireEvent.mouseEnter(screen.getByRole('button', { name: /Test Session/i }));
    fireEvent.click(screen.getByTitle('Delete session'));
    expect(onSelect).not.toHaveBeenCalled();
  });

  // --- Inline rename ---

  it('shows the rename button on hover', () => {
    renderItem(createMockSession());
    expect(screen.queryByTitle('Rename session')).toBeNull();
    fireEvent.mouseEnter(screen.getByRole('button', { name: /Test Session/i }));
    expect(screen.getByTitle('Rename session')).toBeDefined();
  });

  it('enters inline edit mode with the current title prefilled when rename is clicked', () => {
    renderItem(createMockSession({ title: 'Original Title' }));
    fireEvent.mouseEnter(screen.getByRole('button', { name: /Original Title/i }));
    fireEvent.click(screen.getByTitle('Rename session'));

    const input = screen.getByRole('textbox') as HTMLInputElement;
    expect(input).toBeDefined();
    expect(input.value).toBe('Original Title');
  });

  it('does not call onSelect when the rename button is clicked', () => {
    renderItem(createMockSession());
    fireEvent.mouseEnter(screen.getByRole('button', { name: /Test Session/i }));
    fireEvent.click(screen.getByTitle('Rename session'));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('commits the new title with onRename when Enter is pressed', () => {
    renderItem(createMockSession({ title: 'Old' }));
    fireEvent.mouseEnter(screen.getByRole('button', { name: /Old/i }));
    fireEvent.click(screen.getByTitle('Rename session'));

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'New Title' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onRename).toHaveBeenCalledWith('New Title');
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('commits the new title on blur', () => {
    renderItem(createMockSession({ title: 'Old' }));
    fireEvent.mouseEnter(screen.getByRole('button', { name: /Old/i }));
    fireEvent.click(screen.getByTitle('Rename session'));

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'Blurred Title' } });
    fireEvent.blur(input);

    expect(onRename).toHaveBeenCalledWith('Blurred Title');
  });

  it('cancels editing without calling onRename when Escape is pressed', () => {
    renderItem(createMockSession({ title: 'Keep Me' }));
    fireEvent.mouseEnter(screen.getByRole('button', { name: /Keep Me/i }));
    fireEvent.click(screen.getByTitle('Rename session'));

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'Discarded' } });
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(onRename).not.toHaveBeenCalled();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('does not call onRename when the title is empty or only whitespace', () => {
    renderItem(createMockSession({ title: 'Original' }));
    fireEvent.mouseEnter(screen.getByRole('button', { name: /Original/i }));
    fireEvent.click(screen.getByTitle('Rename session'));

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onRename).not.toHaveBeenCalled();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('does not call onRename when the title is unchanged', () => {
    renderItem(createMockSession({ title: 'Same' }));
    fireEvent.mouseEnter(screen.getByRole('button', { name: /Same/i }));
    fireEvent.click(screen.getByTitle('Rename session'));

    const input = screen.getByRole('textbox');
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onRename).not.toHaveBeenCalled();
  });
});
