/**
 * The header's select-all.
 *
 * It changes what is ticked and nothing else — the buttons beside it are what
 * end the review. That distinction is the point: an earlier version put "apply
 * all" next to "apply", one moving ticks and the other writing to disk under
 * the same verb.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SelectAllHunks } from '../SelectAllHunks';
import type { HunkSelection } from '../useHunkSelection';

vi.mock('@/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

function selectionWith(keptCount: number, total: number): HunkSelection {
  return {
    isKept: () => true,
    toggle: vi.fn(),
    keepAll: vi.fn(),
    dropAll: vi.fn(),
    keptCount,
    total,
    acceptedRanges: [],
  };
}

const box = () => screen.getByRole('checkbox') as HTMLInputElement;

describe('SelectAllHunks', () => {
  it('is ticked when every hunk is selected', () => {
    render(<SelectAllHunks selection={selectionWith(3, 3)} />);
    expect(box().checked).toBe(true);
    expect(box().indeterminate).toBe(false);
  });

  it('is empty when none are', () => {
    render(<SelectAllHunks selection={selectionWith(0, 3)} />);
    expect(box().checked).toBe(false);
    expect(box().indeterminate).toBe(false);
  });

  // A state a pair of buttons could not express, which is half the reason this
  // is a checkbox.
  it('is indeterminate when only some are', () => {
    render(<SelectAllHunks selection={selectionWith(2, 3)} />);
    expect(box().indeterminate).toBe(true);
  });

  it('clears the selection when everything is ticked', () => {
    const selection = selectionWith(3, 3);
    render(<SelectAllHunks selection={selection} />);

    fireEvent.click(box());
    expect(selection.dropAll).toHaveBeenCalled();
    expect(selection.keepAll).not.toHaveBeenCalled();
  });

  it('selects everything from empty', () => {
    const selection = selectionWith(0, 3);
    render(<SelectAllHunks selection={selection} />);

    fireEvent.click(box());
    expect(selection.keepAll).toHaveBeenCalled();
  });

  // Matches every file list with this control: a half-ticked box fills up.
  it('selects everything from indeterminate', () => {
    const selection = selectionWith(2, 3);
    render(<SelectAllHunks selection={selection} />);

    fireEvent.click(box());
    expect(selection.keepAll).toHaveBeenCalled();
    expect(selection.dropAll).not.toHaveBeenCalled();
  });

  it('cannot be used while the answer is being sent', () => {
    render(<SelectAllHunks selection={selectionWith(3, 3)} disabled />);
    expect(box()).toBeDisabled();
  });
});
