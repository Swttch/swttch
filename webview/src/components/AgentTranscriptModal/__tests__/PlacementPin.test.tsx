import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// What the pin reads and writes is the settings the screen holds; they are stubbed, so that what is asked is what the
// row asks of them: the place pinned now, and a save of the project's.
let provided = true;
let pinnedNow: string | null = null;
const updateSettingWithScope = vi.fn();
vi.mock('@/contexts/SettingsContext', () => ({
  useSettingsOrNull: () => (provided ? { settings: { runViewPlacement: pinnedNow }, updateSettingWithScope } : null),
}));

import { RunPlacementMenu } from '../RunViewControls';

async function openMenu(onSelect = vi.fn()) {
  render(<RunPlacementMenu placement="side" onSelect={onSelect} />);
  fireEvent.click(screen.getByRole('button', { name: 'Change view options' }));
  await screen.findByRole('menu');
  return { onSelect, rows: screen.getAllByRole('menuitemradio') };
}

beforeEach(() => {
  provided = true;
  pinnedNow = null;
  updateSettingWithScope.mockClear();
});

describe('the pin on a row of the view options menu', () => {
  it('has a pin on every row, and the row still picks the place when it is pressed', async () => {
    const { onSelect, rows } = await openMenu();
    expect(rows.map((row) => row.textContent)).toEqual(['Side view', 'View in center', 'Full page view', 'New tab']);
    expect(screen.getAllByRole('button', { name: 'Make default' })).toHaveLength(4);
    expect(screen.queryByRole('button', { name: 'Unpin' })).not.toBeInTheDocument();

    fireEvent.click(rows[1]);
    expect(onSelect).toHaveBeenCalledWith('center');
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
  });

  it('pins a place for the project when its pin is pressed, and does not pick the place', async () => {
    const { onSelect } = await openMenu();
    fireEvent.click(screen.getByTestId('pin-tab'));

    expect(updateSettingWithScope).toHaveBeenCalledWith('runViewPlacement', 'tab', 'project');
    expect(onSelect).not.toHaveBeenCalled();
    // The menu is still there: pinning is not a pick.
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('shows the pinned place with a solid pin, which is pressed, and offers to take it off', async () => {
    pinnedNow = 'center';
    const { onSelect } = await openMenu();
    expect(screen.getByTestId('pin-center').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('pin-center').getAttribute('aria-label')).toBe('Unpin');
    expect(screen.getByTestId('pin-side').getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByTestId('pin-side').getAttribute('aria-label')).toBe('Make default');

    // Pressing the pin that is set takes it off for the project (a null saved there removes the key), and picks nothing.
    fireEvent.click(screen.getByTestId('pin-center'));
    expect(updateSettingWithScope).toHaveBeenCalledWith('runViewPlacement', null, 'project');
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('has the tick for the place in use and the solid pin for the pinned one when the pointer is not on them', async () => {
    pinnedNow = 'center';
    const { rows } = await openMenu();
    // The tick rides on the row in use, the solid pin on the pinned one; both are hidden under the pointer by CSS.
    const marks = (row: HTMLElement) => ({
      tick: !!row.querySelector('svg.group-hover\\:hidden:not([fill=currentColor])'),
      pin: !!row.querySelector('svg.group-hover\\:hidden[fill=currentColor]'),
    });
    expect(marks(rows[0])).toEqual({ tick: true, pin: false });
    expect(marks(rows[1])).toEqual({ tick: false, pin: true });
    expect(marks(rows[2])).toEqual({ tick: false, pin: false });
  });

  it('shows the tick alone, and no pin, where there is no settings to keep a pin in', async () => {
    provided = false;
    const { rows } = await openMenu();
    expect(screen.queryByRole('button', { name: 'Make default' })).not.toBeInTheDocument();
    expect(rows[0].querySelector('svg:last-child')).not.toBeNull();
  });
});
