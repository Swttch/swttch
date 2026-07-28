import { useState, useCallback, useEffect, useMemo, KeyboardEvent, RefObject } from 'react';
import { PanelSection, PanelItemType, ActionItem, CommandItem, PanelItem } from '@/types/commandPalette';
import { useCommandPaletteRegistry } from '../CommandPaletteProvider';
import { useCliConfig } from '@/contexts/CliConfigContext';
import { isCaretInMentionToken } from '@/utils/isCaretInMentionToken';

interface UseCommandPaletteOptions {
  onChange: (value: string) => void;
  textareaRef: RefObject<HTMLDivElement | null>;
}

export function useCommandPalette({ onChange, textareaRef }: UseCommandPaletteOptions) {
  const { sections } = useCommandPaletteRegistry();
  const { refresh: refreshCliConfig } = useCliConfig();

  // --- Panel state (from useSlashCommandPanel) ---
  const [filterQuery, setFilterQuery] = useState('');
  const [selectedSectionIndex, setSelectedSectionIndex] = useState(0);
  const [selectedItemIndex, setSelectedItemIndex] = useState(0);
  const [showSlashCommands, setShowSlashCommands] = useState(false);
  // True once the user types a space after the command (i.e. arguments). The
  // command is settled, so the panel narrows to the exact command instead of
  // keeping fuzzy description matches around.
  const [argMode, setArgMode] = useState(false);

  // Refetch the CLI config each time the panel opens so runtime-added skills/
  // commands (e.g. after /reload) show up without a manual reload. The cached
  // list stays visible until the refetch resolves — no flicker (issue #176).
  useEffect(() => {
    if (showSlashCommands) void refreshCliConfig();
  }, [showSlashCommands, refreshCliConfig]);

  const filteredSections = useMemo(() => {
    const query = filterQuery.toLowerCase();
    const hasQuery = query.length > 0;

    // Rank a match so a name (label) hit beats a description-only hit, and an
    // earlier name position (prefix) beats a later one — otherwise "/model"
    // ranks below "/claude-api" just because its description mentions "model".
    // Lower is better; items are already filtered so a match always exists.
    const matchRank = (item: PanelItem): number => {
      const labelIdx = item.label.toLowerCase().indexOf(query);
      if (labelIdx !== -1) return labelIdx;
      if (item.keywords?.some(k => k.toLowerCase().includes(query))) return 500;
      return 1000; // description-only match
    };

    return sections
      .map((section, index) => {
        const filteredItems = section.items.filter(item => {
          // searchOnly items stay hidden until the user types a matching query.
          if (item.searchOnly && !hasQuery) return false;
          if (hasQuery) {
            // Argument mode: the command is settled ("/model sonnet"), so only
            // the exact command name stays — no fuzzy/description matches.
            if (argMode) {
              return item.label.toLowerCase() === `/${query}`;
            }
            const matchesLabel = item.label.toLowerCase().includes(query);
            const matchesKeyword = item.keywords?.some(keyword =>
              keyword.toLowerCase().includes(query),
            );
            // Slash commands carry a CLI-provided description; match on it too
            // so e.g. "/review" surfaces on "github pull request" (issue #167).
            const matchesDescription =
              item.type === PanelItemType.Command &&
              (item as CommandItem).description.toLowerCase().includes(query);
            return matchesLabel || (matchesKeyword ?? false) || matchesDescription;
          }
          return true;
        });
        if (filteredItems.length === 0) return null;
        // Order by relevance when searching; keep the section's own order (e.g.
        // alphabetical) otherwise. Sort is stable, so equal ranks keep it.
        const orderedItems = hasQuery
          ? [...filteredItems].sort((a, b) => matchRank(a) - matchRank(b))
          : filteredItems;
        return {
          ...section,
          showDividerAbove: hasQuery ? index > 0 : section.showDividerAbove,
          items: orderedItems,
        };
      })
      .filter((section): section is PanelSection => section !== null);
  }, [sections, filterQuery, argMode]);

  const selectItem = useCallback((sectionIndex: number, itemIndex: number) => {
    setSelectedSectionIndex(sectionIndex);
    setSelectedItemIndex(itemIndex);
  }, []);

  const resetSelection = useCallback(() => {
    setSelectedSectionIndex(0);
    setSelectedItemIndex(0);
    setFilterQuery('');
    setArgMode(false);
  }, []);

  const getTotalItemCount = useCallback(() => {
    return filteredSections.reduce((count, section) => count + section.items.length, 0);
  }, [filteredSections]);

  const getFlatIndex = useCallback(() => {
    let flatIndex = 0;
    for (let i = 0; i < selectedSectionIndex; i++) {
      flatIndex += filteredSections[i]?.items.length ?? 0;
    }
    return flatIndex + selectedItemIndex;
  }, [filteredSections, selectedSectionIndex, selectedItemIndex]);

  const moveSelection = useCallback((direction: 'up' | 'down') => {
    const sectionsToUse = filteredSections;
    if (sectionsToUse.length === 0) return;

    let newSectionIndex = selectedSectionIndex;
    let newItemIndex = selectedItemIndex;

    if (direction === 'down') {
      const currentSection = sectionsToUse[newSectionIndex];
      if (!currentSection) return;

      if (newItemIndex < currentSection.items.length - 1) {
        newItemIndex++;
      } else if (newSectionIndex < sectionsToUse.length - 1) {
        newSectionIndex++;
        newItemIndex = 0;
      } else {
        newSectionIndex = 0;
        newItemIndex = 0;
      }
    } else {
      if (newItemIndex > 0) {
        newItemIndex--;
      } else if (newSectionIndex > 0) {
        newSectionIndex--;
        newItemIndex = sectionsToUse[newSectionIndex].items.length - 1;
      } else {
        newSectionIndex = sectionsToUse.length - 1;
        newItemIndex = sectionsToUse[newSectionIndex].items.length - 1;
      }
    }

    setSelectedSectionIndex(newSectionIndex);
    setSelectedItemIndex(newItemIndex);
  }, [filteredSections, selectedSectionIndex, selectedItemIndex]);

  // Toggle/Link branches removed - no registered items use these types
  const executeSelectedItem = useCallback(() => {
    const section = filteredSections[selectedSectionIndex];
    if (!section) return;

    const item = section.items[selectedItemIndex];
    if (!item) return;

    if (item.type === PanelItemType.Action || item.type === PanelItemType.Command) {
      (item as ActionItem | CommandItem).action();
    }
  }, [filteredSections, selectedSectionIndex, selectedItemIndex]);

  // --- Interaction (from useSlashCommandInteraction) ---

  const executeAndClear = useCallback(() => {
    executeSelectedItem();
    setShowSlashCommands(false);
    resetSelection();
    // Clear the "/command" text the user typed to open the panel — the item has
    // run, so leaving it behind would strand a stale query in the input.
    onChange('');
  }, [executeSelectedItem, resetSelection, onChange]);

  const closePanel = useCallback(() => {
    setShowSlashCommands(false);
    resetSelection();
  }, [resetSelection]);

  const handleSlashKeyDown = useCallback((
    e: KeyboardEvent<HTMLElement>,
    currentValue: string,
  ): boolean => {
    if (!showSlashCommands) return false;

    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      const hasItems = filteredSections.some(s => s.items.length > 0);
      if (hasItems) {
        e.preventDefault();
        const selectedItem = filteredSections[selectedSectionIndex]?.items[selectedItemIndex];
        if (selectedItem?.keepOpen) {
          // keepOpen items (e.g. Effort) act in place: run the action but keep
          // the panel open and the typed "/query" intact, so pressing Enter
          // repeatedly cycles the value — matching the click behavior. Without
          // this, Enter would advance one step then close the panel, which
          // read as "nothing happens" (issue #121).
          executeSelectedItem();
        } else {
          executeAndClear();
        }
        return true;
      }
      // No matching command — close panel, let normal submit handle it
      closePanel();
      return false;
    }
    if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault();
      const section = filteredSections[selectedSectionIndex];
      const item = section?.items[selectedItemIndex];
      if (item && item.type === PanelItemType.Command) {
        const firstSpaceIdx = currentValue.indexOf(' ');
        const rest = firstSpaceIdx === -1 ? ' ' : currentValue.slice(firstSpaceIdx);
        onChange(`${(item as CommandItem).name}${rest}`);
        closePanel();
      }
      return true;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      moveSelection('up');
      return true;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      moveSelection('down');
      return true;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      closePanel();
      return true;
    }

    return false;
  }, [showSlashCommands, filteredSections, selectedSectionIndex, selectedItemIndex, executeSelectedItem, executeAndClear, closePanel, moveSelection, onChange]);

  const detectSlashCommand = useCallback((newValue: string, caretPosition?: number) => {
    // The panel shares one slot above the composer with the file mention
    // dropdown, so it steps aside while the caret sits inside an `@token` —
    // there the user is picking a file, not a command. Without this the panel
    // stayed pinned open for the whole line (it only checked for a leading
    // "/") and hid the mention dropdown on every "/command @file" (issue #236).
    // Callers that track no caret keep the pre-#236 behaviour.
    if (caretPosition !== undefined && isCaretInMentionToken(newValue, caretPosition)) {
      setShowSlashCommands(false);
      resetSelection();
      return;
    }

    // Keep the panel open while typing a slash command AND its arguments, so
    // "/model sonnet" still shows "/model" selected instead of the panel
    // vanishing the moment a space is typed. Filter by the command name (the
    // first whitespace-delimited token) rather than the whole input.
    if (newValue.startsWith('/')) {
      const commandToken = newValue.split(/\s/, 1)[0]; // "/model" from "/model sonnet"
      setShowSlashCommands(true);
      setFilterQuery(commandToken.substring(1));
      // A space means arguments are being typed — lock to the exact command.
      setArgMode(/\s/.test(newValue));
      setSelectedSectionIndex(0);
      setSelectedItemIndex(0);
    } else {
      setShowSlashCommands(false);
      resetSelection();
    }
  }, [resetSelection]);

  const handlePanelItemExecute = useCallback((item: PanelItem) => {
    if (item.type === PanelItemType.Action || item.type === PanelItemType.Command) {
      (item as ActionItem | CommandItem).action();
    }
    if (item.keepOpen) return;
    setShowSlashCommands(false);
    resetSelection();
    // Mirror executeAndClear: clicking a panel item also clears the "/command"
    // query the user typed, so it doesn't linger in the input after the action.
    onChange('');
  }, [resetSelection, onChange]);

  const handleSlashButtonClick = useCallback(() => {
    if (!showSlashCommands) {
      setShowSlashCommands(true);
      setFilterQuery('');
      setSelectedSectionIndex(0);
      setSelectedItemIndex(0);
      textareaRef.current?.focus();
    }
  }, [showSlashCommands, textareaRef]);

  return {
    // Panel state
    sections,
    filteredSections,
    selectedSectionIndex,
    selectedItemIndex,
    filterQuery,
    setFilterQuery,
    selectItem,
    executeSelectedItem,
    resetSelection,
    moveSelection,
    getTotalItemCount,
    getFlatIndex,
    // Interaction
    showSlashCommands,
    handleSlashKeyDown,
    detectSlashCommand,
    handlePanelItemExecute,
    handleSlashButtonClick,
    closePanel,
  };
}
