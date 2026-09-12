import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PromptCategorySidebar, buildSidebarRows } from '../PromptCategorySidebar';
import { ALL_CATEGORIES, UNCATEGORISED } from '@/utils/promptCategories';
import type { PromptCategory } from '@/types/prompt';

const category = (id: string, name: string): PromptCategory => ({ id, name, createdAt: 1 });

const rows = buildSidebarRows(
  [category('c1', '리뷰'), category('c2', '문서')],
  { all: 5, uncategorised: 2, byId: new Map([['c1', 3], ['c2', 0]]) },
  { all: 'All', uncategorised: 'Uncategorised' },
);

function renderSidebar(overrides: Partial<React.ComponentProps<typeof PromptCategorySidebar>> = {}) {
  return render(
    <PromptCategorySidebar
      rows={rows}
      selected={ALL_CATEGORIES}
      isFocusedPane={false}
      onSelect={vi.fn()}
      onCreate={vi.fn()}
      onRename={vi.fn()}
      onDelete={vi.fn()}
      {...overrides}
    />,
  );
}

const rowFor = (key: string) => document.querySelector(`[data-category-key="${key}"]`);

describe('buildSidebarRows', () => {
  it('leads with "all" and trails with "uncategorised"', () => {
    expect(rows.map((row) => row.key)).toEqual([ALL_CATEGORIES, 'c1', 'c2', UNCATEGORISED]);
  });

  // A tidy library should not carry a row telling it that nothing is untidy.
  it('leaves out "uncategorised" when nothing is filed under nothing', () => {
    const tidy = buildSidebarRows(
      [category('c1', '리뷰')],
      { all: 1, uncategorised: 0, byId: new Map([['c1', 1]]) },
      { all: 'All', uncategorised: 'Uncategorised' },
    );
    expect(tidy.map((row) => row.key)).toEqual([ALL_CATEGORIES, 'c1']);
  });
});

/**
 * Both columns of the library hold a selection at once, so the selection alone
 * cannot say which one Up and Down would move. The focused column's selected
 * row is ringed; the other column's is not.
 */
describe('which column the arrows are walking', () => {
  it('rings the selected row while this column has the arrows', () => {
    renderSidebar({ isFocusedPane: true, selected: 'c1' });

    expect(rowFor('c1')?.className).toContain('ring-1');
  });

  it('leaves the selected row unringed while the lists have the arrows', () => {
    renderSidebar({ isFocusedPane: false, selected: 'c1' });

    expect(rowFor('c1')?.className).not.toContain('ring-1');
    // Still visibly the chosen category, just not the focused column.
    expect(rowFor('c1')?.className).toContain('bg-surface-selected');
  });

  it('never rings a row that is not the selected one', () => {
    renderSidebar({ isFocusedPane: true, selected: 'c1' });

    expect(rowFor('c2')?.className).not.toContain('ring-1');
  });
});

/**
 * Issue #430 follow-up — the row grew from 21px to 22.75px the moment the
 * pointer touched it, because the two 18px action icons replaced a 16px count
 * IN FLOW and the whole sidebar shifted under the cursor.
 *
 * Asserted on the classes because jsdom lays nothing out and reports every
 * height as 0, so the class is what the contract is written in. The heights
 * above were measured in a real browser, and are 21px in both states now.
 */
describe('the row does not change height on hover', () => {
  it('takes the actions out of flow so only the count sets the height', () => {
    renderSidebar({ selected: ALL_CATEGORIES });

    // One per category row; any of them makes the point.
    const actions = screen.getAllByLabelText('Edit')[0].parentElement;
    expect(actions?.className).toContain('absolute');
    expect(actions?.className).toContain('inset-y-0');
  });

  it('hides the count rather than unmounting it, so it keeps holding the height', () => {
    renderSidebar({ selected: ALL_CATEGORIES });

    const count = screen.getByText('(3)');
    expect(count.className).toContain('group-hover/cat:invisible');
    expect(count.className).not.toContain('group-hover/cat:hidden');
  });

  /**
   * "All" and "Uncategorised" are not the user's to rename or remove, so there
   * is nothing to swap their count out FOR. Blanking it on hover promised an
   * action the row does not have.
   */
  it('leaves the fixed rows alone on hover, because they have no actions', () => {
    renderSidebar({ selected: ALL_CATEGORIES });

    expect(screen.getByText('(5)').className ?? '').not.toContain('group-hover/cat:invisible');
    expect(screen.getByText('(2)').className ?? '').not.toContain('group-hover/cat:invisible');
  });
});
