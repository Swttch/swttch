/**
 * The header's select-all.
 *
 * It moves decisions around; the buttons beside it end the review. That
 * distinction is the point — an earlier version put "apply all" next to
 * "apply", one shifting state and the other writing to disk under the same
 * verb.
 *
 * Unticking returns hunks to UNDECIDED rather than denying them, so clearing a
 * selection is not itself a decision and nothing typed is lost.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SelectAllHunks } from '../SelectAllHunks';
import type { HunkDecisions } from '../useHunkDecisions';

vi.mock('@/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

function decisionsWith(over: Partial<HunkDecisions>): HunkDecisions {
  return {
    decisionFor: () => undefined,
    keep: vi.fn(),
    undo: vi.fn(),
    reset: vi.fn(),
    acceptAll: vi.fn(),
    resetAll: vi.fn(),
    allAccepted: false,
    openCount: 3,
    keptCount: 3,
    total: 3,
    acceptedRanges: [],
    ...over,
  };
}

const box = () => screen.getByRole('checkbox') as HTMLInputElement;

describe('SelectAllHunks', () => {
  it('is ticked when every hunk is accepted', () => {
    render(<SelectAllHunks decisions={decisionsWith({ allAccepted: true, openCount: 0 })} />);

    expect(box().checked).toBe(true);
    expect(box().indeterminate).toBe(false);
  });

  it('is empty when nothing has been decided', () => {
    render(<SelectAllHunks decisions={decisionsWith({ openCount: 3, total: 3 })} />);

    expect(box().checked).toBe(false);
    expect(box().indeterminate).toBe(false);
  });

  // A state a pair of buttons could not express, which is half the reason this
  // is a checkbox.
  it('is indeterminate part-way through', () => {
    render(<SelectAllHunks decisions={decisionsWith({ openCount: 1, total: 3 })} />);

    expect(box().indeterminate).toBe(true);
  });

  it('accepts everything from empty', () => {
    const decisions = decisionsWith({ openCount: 3, total: 3 });
    render(<SelectAllHunks decisions={decisions} />);

    fireEvent.click(box());

    expect(decisions.acceptAll).toHaveBeenCalled();
    expect(decisions.resetAll).not.toHaveBeenCalled();
  });

  // Matches every file list with this control: a half-ticked box fills up.
  it('accepts everything from indeterminate', () => {
    const decisions = decisionsWith({ openCount: 1, total: 3 });
    render(<SelectAllHunks decisions={decisions} />);

    fireEvent.click(box());

    expect(decisions.acceptAll).toHaveBeenCalled();
  });

  it('puts every hunk back when it was fully ticked', () => {
    // resetAll, not a bulk deny: unticking is not a decision.
    const decisions = decisionsWith({ allAccepted: true, openCount: 0 });
    render(<SelectAllHunks decisions={decisions} />);

    fireEvent.click(box());

    expect(decisions.resetAll).toHaveBeenCalled();
    expect(decisions.acceptAll).not.toHaveBeenCalled();
  });

  it('cannot be used while the answer is being sent', () => {
    render(<SelectAllHunks decisions={decisionsWith({})} disabled />);

    expect(box()).toBeDisabled();
  });
});
