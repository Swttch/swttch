import { describe, it, expect, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import '@/i18n/config';
import { HistoryNotice } from '../HistoryNotice';
import { LiveText } from '../draft/liveText';

const idle = { position: null, modified: false, guarded: false, hasDraft: false };
const walking = { ...idle, position: { index: 5, total: 6 } };

/** The line as read, open or not. */
const line = (container: HTMLElement) => container.querySelector('[role="status"]')!;

describe('HistoryNotice', () => {
  it('shows nothing while the arrows are not in the history', () => {
    const { container } = render(<HistoryNotice {...idle} />);

    expect(screen.queryByRole('status')).toBeNull();
    expect(line(container).textContent).toBe('');
  });

  it('says the way back to a draft that waits, behind the position', () => {
    render(<HistoryNotice {...walking} modified hasDraft />);

    expect(screen.getByRole('status').textContent).toBe('History 5/6Edited1·↓ to restore your draft');
    expect(screen.getByRole('status').querySelector('kbd')?.textContent).toBe('↓');
  });

  it('says no way back when no draft waits', () => {
    render(<HistoryNotice {...walking} />);

    expect(screen.getByRole('status').textContent).toBe('History 5/6');
  });

  it('marks a send as edited while the first syllable is still being composed', () => {
    const liveText = new LiveText();
    render(<HistoryNotice {...walking} liveText={liveText} isModifiedWith={(text) => text !== 'sent'} />);

    act(() => liveText.set('sentㅇ'));
    expect(screen.getByRole('status').textContent).toBe('History 5/6Edited1');

    act(() => liveText.set('sent'));
    expect(screen.getByRole('status').textContent).toBe('History 5/6');
  });

  it('counts the edits kept elsewhere, on a send left as sent and on the draft', () => {
    const view = render(<HistoryNotice {...walking} otherEdits={2} />);
    expect(screen.getByRole('status').textContent).toBe('History 5/6Edits2');

    view.rerender(<HistoryNotice {...idle} otherEdits={2} />);
    expect(screen.getByRole('status').textContent).toBe('Edits2');
  });

  it('counts the send shown among the edits once it is changed', () => {
    render(<HistoryNotice {...walking} modified otherEdits={2} />);

    expect(screen.getByRole('button').textContent).toBe('Edited3');
  });

  it('opens the history from the mark, which stays the same button while the guard comes and goes', () => {
    const onOpenHistory = vi.fn();
    const view = render(<HistoryNotice {...idle} guarded otherEdits={1} onOpenHistory={onOpenHistory} />);
    const mark = screen.getByRole('button');

    view.rerender(<HistoryNotice {...idle} otherEdits={1} onOpenHistory={onOpenHistory} />);
    fireEvent.click(mark);

    expect(screen.getByRole('button')).toBe(mark);
    expect(onOpenHistory).toHaveBeenCalled();
  });

  it('keeps its words while it closes, hidden from readers', () => {
    const { container, rerender } = render(<HistoryNotice {...walking} />);

    rerender(<HistoryNotice {...idle} />);

    expect(line(container).textContent).toBe('History 5/6');
    expect(screen.queryByRole('status')).toBeNull();
  });
});
