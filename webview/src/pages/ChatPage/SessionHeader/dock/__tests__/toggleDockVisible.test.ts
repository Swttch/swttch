import { describe, it, expect } from 'vitest';
import { DockItemId } from '@/types/settings';
import { toggleDockVisible } from '../toggleDockVisible';

const { TOKEN_BATTERY, TUNNEL, SETTINGS } = DockItemId;

describe('toggleDockVisible', () => {
  const layout = { order: [TOKEN_BATTERY, TUNNEL, SETTINGS], visible: [TUNNEL] };

  it('adds an item to visible', () => {
    const next = toggleDockVisible(layout, SETTINGS);
    expect(next.visible).toEqual([TUNNEL, SETTINGS]);
  });

  it('removes an item from visible', () => {
    const next = toggleDockVisible(layout, TUNNEL);
    expect(next.visible).toEqual([]);
  });

  it('never changes order', () => {
    const next = toggleDockVisible(layout, SETTINGS);
    expect(next.order).toEqual(layout.order);
  });

  it('does not mutate the input layout', () => {
    const original = { order: [TUNNEL, SETTINGS], visible: [] };
    const snapshot = JSON.parse(JSON.stringify(original));
    toggleDockVisible(original, TUNNEL);
    expect(original).toEqual(snapshot);
  });
});
