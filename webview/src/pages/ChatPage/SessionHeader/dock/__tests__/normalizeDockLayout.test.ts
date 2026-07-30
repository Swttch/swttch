import { describe, it, expect } from 'vitest';
import { DockItemId } from '@/types/settings';
import { normalizeDockLayout } from '../normalizeDockLayout';

const ALL_IDS = Object.values(DockItemId);

describe('normalizeDockLayout', () => {
  it('treats an empty layout as "nothing docked yet"', () => {
    const result = normalizeDockLayout({ docked: [], hidden: [] });
    expect(result.docked).toEqual([]);
    expect(result.hidden).toEqual(ALL_IDS);
  });

  it('treats a missing/malformed layout as an empty one rather than throwing', () => {
    for (const bad of [undefined, null, 'nope', 42, [], {}]) {
      const result = normalizeDockLayout(bad as never);
      expect(result.docked).toEqual([]);
      expect(result.hidden).toEqual(ALL_IDS);
    }
  });

  it('keeps the saved order of both sections', () => {
    const result = normalizeDockLayout({
      docked: [DockItemId.SETTINGS, DockItemId.NEW_TAB],
      hidden: [DockItemId.TUNNEL, DockItemId.TOKEN_BATTERY],
    });
    expect(result.docked).toEqual([DockItemId.SETTINGS, DockItemId.NEW_TAB]);
    expect(result.hidden.slice(0, 2)).toEqual([DockItemId.TUNNEL, DockItemId.TOKEN_BATTERY]);
  });

  // A newly shipped item is absent from every layout saved before it existed. It
  // must surface in the ⋮ menu rather than being invisible until the user resets.
  it('appends items missing from the saved layout to hidden, in declaration order', () => {
    const result = normalizeDockLayout({ docked: [DockItemId.NEW_TAB], hidden: [] });

    expect(result.docked).toEqual([DockItemId.NEW_TAB]);
    const expectedHidden = ALL_IDS.filter((id) => id !== DockItemId.NEW_TAB);
    expect(result.hidden).toEqual(expectedHidden);
  });

  it('never loses an item: docked + hidden always covers every known id exactly once', () => {
    const result = normalizeDockLayout({
      docked: [DockItemId.TUNNEL],
      hidden: [DockItemId.SETTINGS],
    });
    const seen = [...result.docked, ...result.hidden];
    expect([...seen].sort()).toEqual([...ALL_IDS].sort());
    expect(new Set(seen).size).toBe(ALL_IDS.length);
  });

  // Ids from a newer/older build, or a hand-edited settings file.
  it('drops ids it does not recognize', () => {
    const result = normalizeDockLayout({
      docked: [DockItemId.NEW_TAB, 'ghostItem' as DockItemId],
      hidden: ['alsoGone' as DockItemId],
    });
    expect(result.docked).toEqual([DockItemId.NEW_TAB]);
    expect(result.hidden).not.toContain('ghostItem');
    expect(result.hidden).not.toContain('alsoGone');
  });

  // The backend rejects duplicates, but a hand-edited file can still carry them,
  // and rendering the same icon twice would make the drag reorder ambiguous.
  it('keeps the first occurrence when an id is duplicated', () => {
    const result = normalizeDockLayout({
      docked: [DockItemId.NEW_TAB, DockItemId.NEW_TAB],
      hidden: [DockItemId.NEW_TAB],
    });
    expect(result.docked).toEqual([DockItemId.NEW_TAB]);
    expect(result.hidden).not.toContain(DockItemId.NEW_TAB);
  });

  it('drops non-string entries without discarding the rest of the section', () => {
    const result = normalizeDockLayout({
      docked: [null as unknown as DockItemId, DockItemId.SETTINGS],
      hidden: [],
    });
    expect(result.docked).toEqual([DockItemId.SETTINGS]);
  });

  it('is idempotent — normalizing its own output changes nothing', () => {
    const once = normalizeDockLayout({ docked: [DockItemId.TUNNEL], hidden: [] });
    expect(normalizeDockLayout(once)).toEqual(once);
  });
});
