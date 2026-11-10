import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCommandPalette } from '../useCommandPalette';
import { PanelItemType, PanelSectionId } from '@/types/commandPalette';
import type { CommandItem, PanelSection } from '@/types/commandPalette';

vi.mock('../../CommandPaletteProvider', () => ({
  useCommandPaletteRegistry: vi.fn(),
}));
vi.mock('@/contexts/CliConfigContext', () => ({
  useCliConfig: vi.fn(),
}));

import { useCommandPaletteRegistry } from '../../CommandPaletteProvider';
import { useCliConfig } from '@/contexts/CliConfigContext';

function command(name: string, description = ''): CommandItem {
  return {
    id: `cli-${name.slice(1)}`,
    label: name,
    type: PanelItemType.Command,
    name,
    description,
    action: vi.fn(),
  } as CommandItem;
}

function sectionOf(...items: CommandItem[]): PanelSection[] {
  return [{ id: PanelSectionId.SlashCommands, title: 'Slash Commands', showDividerAbove: false, items }];
}

describe('slash command initials (issue #666)', () => {
  const onChange = vi.fn();
  const textareaRef = { current: null };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useCliConfig).mockReturnValue({ controlResponse: null, isLoading: false, refresh: vi.fn() });
  });

  function labelsFor(sections: PanelSection[], query: string, argMode = false): string[] {
    vi.mocked(useCommandPaletteRegistry).mockReturnValue({
      sections,
      registry: {} as any,
      keyboardRegistry: {} as any,
    });
    const { result } = renderHook(() => useCommandPalette({ onChange, textareaRef }));
    act(() => {
      result.current.detectSlashCommand(`/${query}${argMode ? ' some text' : ''}`);
    });
    return result.current.filteredSections.flatMap(s => s.items).map(i => i.label);
  }

  const sections = sectionOf(
    command('/grill-with-docs'),
    command('/gwen-wide-dive'),
    command('/model'),
    command('/release-monitor'),
  );

  it('finds /grill-with-docs by "gwd"', () => {
    expect(labelsFor(sectionOf(command('/grill-with-docs'), command('/model')), 'gwd')).toEqual(['/grill-with-docs']);
  });

  it('finds it by the start of the initials', () => {
    expect(labelsFor(sectionOf(command('/grill-with-docs'), command('/model')), 'gw')).toEqual(['/grill-with-docs']);
  });

  it('lists every command that fits when the initials are shared', () => {
    expect(labelsFor(sections, 'gw')).toEqual(['/gwen-wide-dive', '/grill-with-docs']);
  });

  it('puts a name hit above an initials hit', () => {
    const list = sectionOf(command('/grill-with-docs'), command('/rm-gw'), command('/release-monitor'));
    // "rm" is a name hit for /rm-gw and the exact initials of /release-monitor.
    expect(labelsFor(list, 'rm')).toEqual(['/rm-gw', '/release-monitor']);
  });

  it('puts exact initials above a longer initials prefix', () => {
    const list = sectionOf(command('/aa-bb-cc'), command('/ab-cd'));
    expect(labelsFor(list, 'ab')).toEqual(['/ab-cd', '/aa-bb-cc']);
  });

  it('ignores a single letter', () => {
    expect(labelsFor(sectionOf(command('/grill-with-docs')), 'g').length).toBe(1); // name hit only, via substring
    expect(labelsFor(sectionOf(command('/xx-grill-with-docs')), 'x')).toEqual(['/xx-grill-with-docs']);
  });

  it('keeps the command in argument mode when only one has those initials', () => {
    expect(labelsFor(sectionOf(command('/grill-with-docs'), command('/model')), 'gwd', true)).toEqual(['/grill-with-docs']);
  });

  it('leaves the word alone in argument mode when several commands share the initials', () => {
    const list = sectionOf(command('/grill-with-docs'), command('/giant-wide-dog'));
    expect(labelsFor(list, 'gwd', true)).toEqual([]);
  });
});
