import { describe, it, expect } from 'vitest';
import { applyModelCapabilityFlags } from '../applyModelCapabilityFlags';
import { getEffortUnsupportedReason } from '../sections/model/EffortItem';
import { getFastModeUnsupportedReason } from '../sections/model/ToggleFastModeItem';
import { getAutoResumeSponsorOnlyReason } from '../sections/model/ToggleAutoResumeItem';
import { PanelSection, PanelSectionId, PanelItem, PanelItemType } from '@/types/commandPalette';

/** Base flags with everything supported; individual tests override one field. */
const ALL_ON = { supportsEffort: true, supportsFastMode: true, isSponsor: true } as const;

function makeItem(id: string, overrides: Partial<PanelItem> = {}): PanelItem {
  return {
    id,
    label: id,
    type: PanelItemType.Action,
    disabled: false,
    valueComponent: () => null,
    action: async () => {},
    ...overrides,
  } as PanelItem;
}

function makeSection(id: PanelSectionId, items: PanelItem[]): PanelSection {
  return {
    id,
    title: id,
    items,
    showDividerAbove: false,
  };
}

describe('applyModelCapabilityFlags', () => {
  it('disables the effort item with EFFORT_UNSUPPORTED_REASON when supportsEffort is false', () => {
    const section = makeSection(PanelSectionId.Model, [makeItem('effort')]);
    const result = applyModelCapabilityFlags(section, { ...ALL_ON, supportsEffort: false });
    const effort = result.items.find((it) => it.id === 'effort')!;
    expect(effort.disabled).toBe(true);
    expect(effort.disabledReason).toBe(getEffortUnsupportedReason());
  });

  it('enables the effort item with no disabledReason when supportsEffort is true', () => {
    const section = makeSection(PanelSectionId.Model, [makeItem('effort')]);
    const result = applyModelCapabilityFlags(section, { ...ALL_ON });
    const effort = result.items.find((it) => it.id === 'effort')!;
    expect(effort.disabled).toBe(false);
    expect(effort.disabledReason).toBeUndefined();
  });

  it('disables the toggle-fast-mode item with FAST_MODE_UNSUPPORTED_REASON when supportsFastMode is false', () => {
    const section = makeSection(PanelSectionId.Model, [makeItem('toggle-fast-mode')]);
    const result = applyModelCapabilityFlags(section, { ...ALL_ON, supportsFastMode: false });
    const fastMode = result.items.find((it) => it.id === 'toggle-fast-mode')!;
    expect(fastMode.disabled).toBe(true);
    expect(fastMode.disabledReason).toBe(getFastModeUnsupportedReason());
  });

  it('enables the toggle-fast-mode item with no disabledReason when supportsFastMode is true', () => {
    const section = makeSection(PanelSectionId.Model, [makeItem('toggle-fast-mode')]);
    const result = applyModelCapabilityFlags(section, { ...ALL_ON });
    const fastMode = result.items.find((it) => it.id === 'toggle-fast-mode')!;
    expect(fastMode.disabled).toBe(false);
    expect(fastMode.disabledReason).toBeUndefined();
  });

  it('returns non-Model sections unchanged', () => {
    const section = makeSection(PanelSectionId.Settings, [makeItem('some-setting')]);
    const result = applyModelCapabilityFlags(section, { ...ALL_ON, supportsEffort: false, supportsFastMode: false });
    expect(result).toBe(section);
  });

  it('leaves other Model items untouched', () => {
    const section = makeSection(PanelSectionId.Model, [makeItem('thinking')]);
    const result = applyModelCapabilityFlags(section, { ...ALL_ON, supportsEffort: false, supportsFastMode: false });
    const thinking = result.items.find((it) => it.id === 'thinking')!;
    expect(thinking.disabled).toBe(false);
    expect(thinking.disabledReason).toBeUndefined();
  });

  it('disables the toggle-auto-resume item with the sponsor-only reason when isSponsor is false', () => {
    const section = makeSection(PanelSectionId.Model, [makeItem('toggle-auto-resume')]);
    const result = applyModelCapabilityFlags(section, { ...ALL_ON, isSponsor: false });
    const item = result.items.find((it) => it.id === 'toggle-auto-resume')!;
    expect(item.disabled).toBe(true);
    expect(item.disabledReason).toBe(getAutoResumeSponsorOnlyReason());
  });

  it('enables the toggle-auto-resume item with no disabledReason when isSponsor is true', () => {
    const section = makeSection(PanelSectionId.Model, [makeItem('toggle-auto-resume')]);
    const result = applyModelCapabilityFlags(section, { ...ALL_ON });
    const item = result.items.find((it) => it.id === 'toggle-auto-resume')!;
    expect(item.disabled).toBe(false);
    expect(item.disabledReason).toBeUndefined();
  });

  it('does not mutate the original section or its items', () => {
    const original = makeSection(PanelSectionId.Model, [makeItem('effort'), makeItem('toggle-fast-mode')]);
    const originalItemsSnapshot = original.items.map((it) => ({ ...it }));

    applyModelCapabilityFlags(original, { ...ALL_ON, supportsEffort: false, supportsFastMode: false });

    expect(original.items.map((it) => ({ ...it }))).toEqual(originalItemsSnapshot);
  });
});
