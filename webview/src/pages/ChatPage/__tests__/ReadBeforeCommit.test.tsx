import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ReadBeforeCommit } from '../ReadBeforeCommit';

/** #747. The screen is read as the reader has it: after the last render, before anything is written. */
describe('ReadBeforeCommit', () => {
  const draw = (rows: string[], read: () => void) => (
    <>
      <ReadBeforeCommit when={rows[0]} read={read} />
      <ul>
        {rows.map((row) => (
          <li key={row}>{row}</li>
        ))}
      </ul>
    </>
  );

  it('reads the screen as it was, when what it watches changes', () => {
    const seen: string[] = [];
    const read = vi.fn(() => seen.push(document.querySelector('ul')!.textContent!));
    const { rerender } = render(draw(['c', 'd'], read));
    expect(read).not.toHaveBeenCalled();

    rerender(draw(['a', 'b', 'c', 'd'], read));

    expect(seen).toEqual(['cd']);
  });

  it('leaves the screen alone when something else changed', () => {
    const read = vi.fn();
    const { rerender } = render(draw(['c'], read));

    rerender(draw(['c', 'd'], read));

    expect(read).not.toHaveBeenCalled();
  });
});
