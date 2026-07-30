import { describe, it, expect } from 'vitest';
import { DockItemId } from '@/types/settings';
import { moveDockItem } from '../moveDockItem';

const { TOKEN_BATTERY, TUNNEL, SETTINGS, NEW_TAB } = DockItemId;

describe('moveDockItem', () => {
  const layout = {
    order: [TOKEN_BATTERY, TUNNEL, SETTINGS, NEW_TAB],
    visible: [TUNNEL, SETTINGS],
  };

  it('reorders within the list', () => {
    const next = moveDockItem(layout, SETTINGS, 0);
    expect(next.order).toEqual([SETTINGS, TOKEN_BATTERY, TUNNEL, NEW_TAB]);
  });

  it('leaves visible untouched — reordering never changes which items are docked', () => {
    const next = moveDockItem(layout, SETTINGS, 0);
    expect(next.visible).toEqual([TUNNEL, SETTINGS]);
  });

  it('appends when the target index is past the end', () => {
    const next = moveDockItem(layout, TOKEN_BATTERY, 99);
    expect(next.order).toEqual([TUNNEL, SETTINGS, NEW_TAB, TOKEN_BATTERY]);
  });

  it('clamps a negative index to the start', () => {
    const next = moveDockItem(layout, NEW_TAB, -5);
    expect(next.order).toEqual([NEW_TAB, TOKEN_BATTERY, TUNNEL, SETTINGS]);
  });

  // Dropping an item onto its own position must not duplicate or drop it — the
  // removal has to happen before the index is applied.
  it('is a no-op when an item is dropped where it already sits', () => {
    const next = moveDockItem(layout, TOKEN_BATTERY, 0);
    expect(next).toEqual(layout);
  });

  it('never duplicates the moved item', () => {
    const next = moveDockItem(layout, SETTINGS, 3);
    expect(next.order.filter((id) => id === SETTINGS)).toHaveLength(1);
    expect(next.order).toHaveLength(layout.order.length);
  });

  it('leaves the layout untouched for an item order does not contain', () => {
    const sparse = { order: [TUNNEL], visible: [] };
    const next = moveDockItem(sparse, SETTINGS, 0);
    expect(next).toEqual(sparse);
  });

  it('does not mutate the input layout', () => {
    const original = { order: [TUNNEL, SETTINGS, NEW_TAB], visible: [NEW_TAB] };
    const snapshot = JSON.parse(JSON.stringify(original));
    moveDockItem(original, TUNNEL, 2);
    expect(original).toEqual(snapshot);
  });
});
