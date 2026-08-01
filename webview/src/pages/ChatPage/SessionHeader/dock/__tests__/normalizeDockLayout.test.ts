import { describe, it, expect } from 'vitest';
import { DockItemId } from '@/types/settings';
import { normalizeDockLayout } from '../normalizeDockLayout';

const ALL_IDS = Object.values(DockItemId);

describe('normalizeDockLayout', () => {
  it('treats an empty layout as "nothing visible yet, declaration order"', () => {
    const result = normalizeDockLayout({ order: [], visible: [] });
    expect(result.order).toEqual(ALL_IDS);
    expect(result.visible).toEqual([]);
  });

  it('treats a missing/malformed layout as an empty one rather than throwing', () => {
    for (const bad of [undefined, null, 'nope', 42, [], {}]) {
      const result = normalizeDockLayout(bad as never);
      expect(result.order).toEqual(ALL_IDS);
      expect(result.visible).toEqual([]);
    }
  });

  it('keeps the saved order', () => {
    const result = normalizeDockLayout({
      order: [DockItemId.SETTINGS, DockItemId.NEW_TAB, DockItemId.TUNNEL],
      visible: [],
    });
    expect(result.order.slice(0, 3)).toEqual([DockItemId.SETTINGS, DockItemId.NEW_TAB, DockItemId.TUNNEL]);
  });

  // A newly shipped item is absent from every layout saved before it existed. It
  // must surface in the ⋮ menu (in `order`) rather than being invisible forever.
  it('appends items missing from the saved order, in declaration order, defaulting to not visible', () => {
    const result = normalizeDockLayout({ order: [DockItemId.NEW_TAB], visible: [DockItemId.NEW_TAB] });

    expect(result.order[0]).toBe(DockItemId.NEW_TAB);
    const expectedRest = ALL_IDS.filter((id) => id !== DockItemId.NEW_TAB);
    expect(result.order.slice(1)).toEqual(expectedRest);
    expect(result.visible).toEqual([DockItemId.NEW_TAB]);
  });

  it('order always covers every known id exactly once', () => {
    const result = normalizeDockLayout({ order: [DockItemId.TUNNEL], visible: [] });
    expect([...result.order].sort()).toEqual([...ALL_IDS].sort());
    expect(new Set(result.order).size).toBe(ALL_IDS.length);
  });

  // Ids from a newer/older build, or a hand-edited settings file.
  it('drops ids it does not recognize, from both order and visible', () => {
    const result = normalizeDockLayout({
      order: [DockItemId.NEW_TAB, 'ghostItem' as DockItemId],
      visible: ['ghostItem' as DockItemId, DockItemId.NEW_TAB],
    });
    expect(result.order).not.toContain('ghostItem');
    expect(result.visible).toEqual([DockItemId.NEW_TAB]);
  });

  it('keeps the first occurrence when an id is duplicated in order', () => {
    const result = normalizeDockLayout({ order: [DockItemId.NEW_TAB, DockItemId.NEW_TAB], visible: [] });
    expect(result.order.filter((id) => id === DockItemId.NEW_TAB)).toHaveLength(1);
  });

  it('drops non-string entries without discarding the rest', () => {
    const result = normalizeDockLayout({
      order: [null as unknown as DockItemId, DockItemId.SETTINGS],
      visible: [],
    });
    expect(result.order[0]).toBe(DockItemId.SETTINGS);
  });

  // order always ends up covering every known id (unplaced ones are appended), so
  // a visible id absent from the SAVED order can still surface once order fills
  // in — it is only dropped when the id itself is unrecognized (covered above).
  it('does not drop a visible id merely because the saved order omitted it', () => {
    const result = normalizeDockLayout({ order: [DockItemId.SETTINGS], visible: [DockItemId.NEW_TAB] });
    expect(result.visible).toEqual([DockItemId.NEW_TAB]);
  });

  it('is idempotent — normalizing its own output changes nothing', () => {
    const once = normalizeDockLayout({ order: [DockItemId.TUNNEL], visible: [DockItemId.TUNNEL] });
    expect(normalizeDockLayout(once)).toEqual(once);
  });
});
