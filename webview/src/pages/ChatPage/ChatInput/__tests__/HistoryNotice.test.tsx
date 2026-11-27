import { describe, it, expect } from 'vitest';
import { act, render, screen } from '@testing-library/react';
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

    expect(screen.getByRole('status').textContent).toBe('History 5/6Edited·↓ to restore your draft');
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
    expect(screen.getByRole('status').textContent).toBe('History 5/6Edited');

    act(() => liveText.set('sent'));
    expect(screen.getByRole('status').textContent).toBe('History 5/6');
  });

  it('keeps its words while it closes, hidden from readers', () => {
    const { container, rerender } = render(<HistoryNotice {...walking} />);

    rerender(<HistoryNotice {...idle} />);

    expect(line(container).textContent).toBe('History 5/6');
    expect(screen.queryByRole('status')).toBeNull();
  });
});
