import { describe, it, expect } from 'vitest';
import { DockItemId } from '@/types/settings';
import { moveDockItem, DockSection } from '../moveDockItem';

const { TOKEN_BATTERY, TUNNEL, SETTINGS, NEW_TAB } = DockItemId;

describe('moveDockItem', () => {
  const layout = {
    docked: [TUNNEL, SETTINGS],
    hidden: [TOKEN_BATTERY, NEW_TAB],
  };

  it('reorders within the docked section', () => {
    const next = moveDockItem(layout, SETTINGS, DockSection.DOCKED, 0);
    expect(next.docked).toEqual([SETTINGS, TUNNEL]);
    expect(next.hidden).toEqual([TOKEN_BATTERY, NEW_TAB]);
  });

  it('reorders within the hidden section', () => {
    const next = moveDockItem(layout, NEW_TAB, DockSection.HIDDEN, 0);
    expect(next.hidden).toEqual([NEW_TAB, TOKEN_BATTERY]);
    expect(next.docked).toEqual([TUNNEL, SETTINGS]);
  });

  it('moves an item from hidden into the dock at the requested index', () => {
    const next = moveDockItem(layout, NEW_TAB, DockSection.DOCKED, 1);
    expect(next.docked).toEqual([TUNNEL, NEW_TAB, SETTINGS]);
    expect(next.hidden).toEqual([TOKEN_BATTERY]);
  });

  it('moves an item out of the dock into hidden at the requested index', () => {
    const next = moveDockItem(layout, TUNNEL, DockSection.HIDDEN, 1);
    expect(next.docked).toEqual([SETTINGS]);
    expect(next.hidden).toEqual([TOKEN_BATTERY, TUNNEL, NEW_TAB]);
  });

  it('appends when the target index is past the end', () => {
    const next = moveDockItem(layout, TOKEN_BATTERY, DockSection.DOCKED, 99);
    expect(next.docked).toEqual([TUNNEL, SETTINGS, TOKEN_BATTERY]);
  });

  it('clamps a negative index to the start', () => {
    const next = moveDockItem(layout, TOKEN_BATTERY, DockSection.DOCKED, -5);
    expect(next.docked).toEqual([TOKEN_BATTERY, TUNNEL, SETTINGS]);
  });

  // Dragging an item onto its own position must not duplicate or drop it — the
  // removal has to happen before the index is applied.
  it('is a no-op when an item is dropped where it already sits', () => {
    const next = moveDockItem(layout, TUNNEL, DockSection.DOCKED, 0);
    expect(next).toEqual(layout);
  });

  it('never duplicates the moved item across sections', () => {
    const next = moveDockItem(layout, SETTINGS, DockSection.HIDDEN, 0);
    const seen = [...next.docked, ...next.hidden];
    expect(seen.filter((id) => id === SETTINGS)).toHaveLength(1);
    expect(new Set(seen).size).toBe(seen.length);
  });

  it('leaves the layout untouched for an item it does not contain', () => {
    const next = moveDockItem(
      { docked: [TUNNEL], hidden: [] },
      SETTINGS,
      DockSection.DOCKED,
      0,
    );
    expect(next.docked).toEqual([TUNNEL]);
    expect(next.hidden).toEqual([]);
  });

  it('does not mutate the input layout', () => {
    const original = { docked: [TUNNEL, SETTINGS], hidden: [NEW_TAB] };
    const snapshot = JSON.parse(JSON.stringify(original));
    moveDockItem(original, TUNNEL, DockSection.HIDDEN, 0);
    expect(original).toEqual(snapshot);
  });
});
