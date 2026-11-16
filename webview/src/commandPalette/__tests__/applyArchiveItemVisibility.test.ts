import { describe, it, expect } from 'vitest';
import { PanelSectionId } from '@/types/commandPalette';
import type { PanelSection } from '@/types/commandPalette';
import { applyArchiveItemVisibility } from '../applyArchiveItemVisibility';

const section = (id: PanelSectionId): PanelSection =>
  ({ id, title: 't', items: [{ id: 'clear-conversation' }, { id: 'archive-conversation' }] }) as unknown as PanelSection;

const ids = (s: PanelSection) => s.items.map((i) => i.id);

describe('applyArchiveItemVisibility', () => {
  it('keeps the row where archiving can do something', () => {
    expect(ids(applyArchiveItemVisibility(section(PanelSectionId.Context), true))).toContain('archive-conversation');
  });

  it('takes the row out where it would do nothing, without mutating the input', () => {
    const input = section(PanelSectionId.Context);
    expect(ids(applyArchiveItemVisibility(input, false))).toEqual(['clear-conversation']);
    expect(ids(input)).toContain('archive-conversation');
  });

  it('leaves other sections alone', () => {
    const other = section(PanelSectionId.Model);
    expect(applyArchiveItemVisibility(other, false)).toBe(other);
  });
});
