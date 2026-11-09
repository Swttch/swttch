import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SendIndexList, visibleRange, SEND_LIST_ROW_HEIGHT } from '../SendIndex/SendIndexList';

describe('visibleRange', () => {
  it('draws the visible rows and a few beyond them', () => {
    const { start, end } = visibleRange(280, 280, 500, 28, 6);
    expect(start).toBe(4);
    expect(end).toBe(26);
  });

  it('stays inside the list at both ends', () => {
    expect(visibleRange(0, 280, 5, 28, 6)).toEqual({ start: 0, end: 5 });
    expect(visibleRange(10_000, 280, 100, 28, 6).end).toBe(100);
  });
});

describe('SendIndexList', () => {
  const entries = Array.from({ length: 300 }, (_, i) => ({ key: `k${i}`, text: `prompt number ${i}\nsecond line` }));

  it('draws only the rows near the one being read, and marks that one', () => {
    // jsdom has no layout, so the viewport reads as 0 tall; the rows drawn are then just the overscan.
    render(<SendIndexList entries={entries} current={0} onPick={() => {}} />);
    const rows = screen.getAllByRole('option');
    expect(rows.length).toBeLessThan(40);
    expect(rows[0]).toHaveAttribute('aria-selected', 'true');
    expect(rows[0].textContent).toBe('prompt number 0');
  });

  it('picks the row that is clicked', () => {
    const onPick = vi.fn();
    render(<SendIndexList entries={entries} current={0} onPick={onPick} />);
    fireEvent.click(screen.getByText('prompt number 3'));
    expect(onPick).toHaveBeenCalledWith(3);
  });

  it('reads an @@ mention as its label', () => {
    const tagged = [{ key: 'a', text: '<session-mention session-id="x" agent-name="n">@@name</session-mention>\nhello' }];
    render(<SendIndexList entries={tagged} current={0} onPick={() => {}} />);
    expect(screen.getByRole('option').textContent).toBe('@@name');
  });

  it('keeps a fixed row height so the scroll height is true', () => {
    const { container } = render(<SendIndexList entries={entries} current={0} onPick={() => {}} />);
    const spacer = container.querySelector('[role="listbox"] > div') as HTMLElement;
    expect(spacer.style.height).toBe(`${entries.length * SEND_LIST_ROW_HEIGHT}px`);
  });
});
