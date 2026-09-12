import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { PromptList } from '../PromptList';
import type { SavedPrompt } from '@/types/prompt';

const prompt = (id: string, name: string): SavedPrompt => ({
  id,
  name,
  content: `${name} body`,
  createdAt: 1,
  updatedAt: 1,
});

function renderList(overrides: Partial<React.ComponentProps<typeof PromptList>> = {}) {
  return render(
    <PromptList
      globalPrompts={[prompt('g1', 'first'), prompt('g2', 'second')]}
      projectPrompts={[]}
      projectAvailable
      workingDirectory="/work"
      selectedId="g1"
      isFocusedPane
      onUse={vi.fn()}
      onEdit={vi.fn()}
      onDelete={vi.fn()}
      {...overrides}
    />,
  );
}

const cardFor = (id: string) => document.querySelector(`[data-prompt-id="${id}"]`);

/**
 * Issue #430 follow-up — the category column holds a selection of its own, so
 * the card's highlight alone no longer says where Up and Down would go. The
 * `!!` panel had already settled this with a ring on the focused column, and
 * the modal now reads the same way.
 */
describe('which column the arrows are walking', () => {
  it('rings the selected card while the lists have the arrows', () => {
    renderList({ isFocusedPane: true });

    expect(cardFor('g1')?.className).toContain('ring-1');
    expect(cardFor('g1')?.className).toContain('border-border-focus');
  });

  it('leaves the selected card unringed while the category column has them', () => {
    renderList({ isFocusedPane: false });

    const card = cardFor('g1');
    expect(card?.className).not.toContain('ring-1');
    expect(card?.className).not.toContain('border-border-focus');
    // Still visibly the chosen card, just not the focused column.
    expect(card?.className).toContain('bg-surface-selected');
  });

  it('never rings a card that is not the selected one', () => {
    renderList({ isFocusedPane: true });

    expect(cardFor('g2')?.className).not.toContain('ring-1');
    expect(cardFor('g2')?.className).not.toContain('bg-surface-selected');
  });
});
