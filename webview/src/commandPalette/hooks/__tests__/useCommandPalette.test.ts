import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCommandPalette } from '../useCommandPalette';
import { PanelItemType } from '@/types/commandPalette';
import type { ActionItem, CommandItem, PanelSection } from '@/types/commandPalette';
import { PanelSectionId } from '@/types/commandPalette';

// Mock useCommandPaletteRegistry so we don't need Provider context
vi.mock('../../CommandPaletteProvider', () => ({
  useCommandPaletteRegistry: vi.fn(),
}));

// Mock useCliConfig so the hook can trigger a refresh on panel open (issue #176)
// without a real CliConfigProvider / React Query client.
vi.mock('@/contexts/CliConfigContext', () => ({
  useCliConfig: vi.fn(),
}));

import { useCommandPaletteRegistry } from '../../CommandPaletteProvider';
import { useCliConfig } from '@/contexts/CliConfigContext';

const mockRefresh = vi.fn();

const mockSections: PanelSection[] = [
  {
    id: PanelSectionId.Model,
    title: 'Model',
    showDividerAbove: false,
    items: [
      {
        id: 'model-action',
        label: 'Claude Sonnet',
        type: PanelItemType.Action,
        action: vi.fn(),
      } as ActionItem,
    ],
  },
];

function setupMockRegistry(sections: PanelSection[] = mockSections) {
  vi.mocked(useCommandPaletteRegistry).mockReturnValue({
    sections,
    registry: {} as any,
    keyboardRegistry: {} as any,
  });
}

describe('useCommandPalette', () => {
  let onChange: ReturnType<typeof vi.fn<(value: string) => void>>;
  let textareaRef: { current: HTMLDivElement | null };

  beforeEach(() => {
    vi.clearAllMocks();
    onChange = vi.fn<(value: string) => void>();
    textareaRef = { current: null };
    setupMockRegistry();
    vi.mocked(useCliConfig).mockReturnValue({
      controlResponse: null,
      isLoading: false,
      refresh: mockRefresh,
    });
  });

  // ──────────────────────────────────────────────────────
  // handleSlashButtonClick
  // ──────────────────────────────────────────────────────

  describe('handleSlashButtonClick', () => {
    it('does not call onChange when input is empty and panel is closed', () => {
      const { result } = renderHook(() =>
        useCommandPalette({ onChange, textareaRef }),
      );

      act(() => {
        result.current.handleSlashButtonClick();
      });

      expect(onChange).not.toHaveBeenCalled();
      expect(result.current.showSlashCommands).toBe(true);
    });

    it('does not call onChange when input has existing text and panel is closed', () => {
      const { result } = renderHook(() =>
        useCommandPalette({ onChange, textareaRef }),
      );

      // Simulate: user already typed something in the textarea
      // The hook itself does not hold the input value — it only exposes onChange.
      // So we verify onChange is NOT called regardless of external textarea state.
      act(() => {
        result.current.handleSlashButtonClick();
      });

      // onChange must never be called from handleSlashButtonClick
      expect(onChange).not.toHaveBeenCalled();
      expect(result.current.showSlashCommands).toBe(true);
    });

    it('opens the panel when closed', () => {
      const { result } = renderHook(() =>
        useCommandPalette({ onChange, textareaRef }),
      );

      expect(result.current.showSlashCommands).toBe(false);

      act(() => {
        result.current.handleSlashButtonClick();
      });

      expect(result.current.showSlashCommands).toBe(true);
    });

    it('does nothing when panel is already open', () => {
      const { result } = renderHook(() =>
        useCommandPalette({ onChange, textareaRef }),
      );

      act(() => {
        result.current.handleSlashButtonClick();
      });

      const onChangeCalls = onChange.mock.calls.length;

      act(() => {
        result.current.handleSlashButtonClick();
      });

      // Second click must not call onChange either
      expect(onChange.mock.calls.length).toBe(onChangeCalls);
    });
  });

  // ──────────────────────────────────────────────────────
  // handlePanelItemExecute
  // ──────────────────────────────────────────────────────

  describe('handlePanelItemExecute', () => {
    it('clears the input (onChange "") when keepOpen=false item is executed', () => {
      const { result } = renderHook(() =>
        useCommandPalette({ onChange, textareaRef }),
      );

      const actionFn = vi.fn();
      const item: ActionItem = {
        id: 'test-action',
        label: 'Test Action',
        type: PanelItemType.Action,
        keepOpen: false,
        action: actionFn,
      };

      act(() => {
        result.current.handlePanelItemExecute(item);
      });

      expect(actionFn).toHaveBeenCalledTimes(1);
      // The "/query" the user typed to open the panel must be cleared from the input.
      expect(onChange).toHaveBeenCalledWith('');
      expect(result.current.showSlashCommands).toBe(false);
    });

    it('does not call onChange when keepOpen=true item is executed', () => {
      const { result } = renderHook(() =>
        useCommandPalette({ onChange, textareaRef }),
      );

      // Open panel first
      act(() => {
        result.current.handleSlashButtonClick();
      });

      vi.clearAllMocks(); // reset onChange call count after handleSlashButtonClick

      const actionFn = vi.fn();
      const item: ActionItem = {
        id: 'test-action-keep-open',
        label: 'Test Action Keep Open',
        type: PanelItemType.Action,
        keepOpen: true,
        action: actionFn,
      };

      act(() => {
        result.current.handlePanelItemExecute(item);
      });

      expect(actionFn).toHaveBeenCalledTimes(1);
      expect(onChange).not.toHaveBeenCalled();
      // Panel stays open because keepOpen=true
      expect(result.current.showSlashCommands).toBe(true);
    });

    it('closes the panel when keepOpen=false', () => {
      const { result } = renderHook(() =>
        useCommandPalette({ onChange, textareaRef }),
      );

      // Open panel
      act(() => {
        result.current.handleSlashButtonClick();
      });

      expect(result.current.showSlashCommands).toBe(true);

      const item: ActionItem = {
        id: 'close-action',
        label: 'Close Action',
        type: PanelItemType.Action,
        keepOpen: false,
        action: vi.fn(),
      };

      act(() => {
        result.current.handlePanelItemExecute(item);
      });

      expect(result.current.showSlashCommands).toBe(false);
    });
  });

  // ──────────────────────────────────────────────────────
  // executeAndClear (called via Enter key path)
  // ──────────────────────────────────────────────────────

  describe('executeAndClear (via handleSlashKeyDown Enter)', () => {
    it('clears the input (onChange "") when selected item is executed', () => {
      // Use sections that have a selectable Action item
      const actionFn = vi.fn();
      const sectionsWithItem: PanelSection[] = [
        {
          id: PanelSectionId.Model,
          title: 'Model',
          showDividerAbove: false,
          items: [
            {
              id: 'model-action',
              label: 'Select Model',
              type: PanelItemType.Action,
              action: actionFn,
            } as ActionItem,
          ],
        },
      ];

      setupMockRegistry(sectionsWithItem);

      const { result } = renderHook(() =>
        useCommandPalette({ onChange, textareaRef }),
      );

      // Open panel so there are filtered sections
      act(() => {
        result.current.handleSlashButtonClick();
      });

      vi.clearAllMocks(); // reset onChange count

      // Simulate Enter key press
      const enterEvent = {
        key: 'Enter',
        shiftKey: false,
        nativeEvent: { isComposing: false },
        preventDefault: vi.fn(),
      } as unknown as import('react').KeyboardEvent<HTMLElement>;

      act(() => {
        result.current.handleSlashKeyDown(enterEvent, '/');
      });

      expect(actionFn).toHaveBeenCalledTimes(1);
      // Enter-executing a panel item clears the "/query" from the input too.
      expect(onChange).toHaveBeenCalledWith('');
      expect(result.current.showSlashCommands).toBe(false);
    });

    it('keeps the panel open and the query intact for a keepOpen item (issue #121)', () => {
      // Effort is a keepOpen item: pressing Enter should run its action and
      // leave the panel open so repeated Enter cycles the value, instead of
      // advancing once and closing (which read as "nothing happens").
      const actionFn = vi.fn();
      const sectionsWithKeepOpen: PanelSection[] = [
        {
          id: PanelSectionId.Model,
          title: 'Model',
          showDividerAbove: false,
          items: [
            {
              id: 'effort',
              label: 'Effort',
              type: PanelItemType.Action,
              keepOpen: true,
              action: actionFn,
            } as ActionItem,
          ],
        },
      ];

      setupMockRegistry(sectionsWithKeepOpen);

      const { result } = renderHook(() =>
        useCommandPalette({ onChange, textareaRef }),
      );

      act(() => {
        result.current.handleSlashButtonClick();
      });

      vi.clearAllMocks();

      const enterEvent = {
        key: 'Enter',
        shiftKey: false,
        nativeEvent: { isComposing: false },
        preventDefault: vi.fn(),
      } as unknown as import('react').KeyboardEvent<HTMLElement>;

      act(() => {
        result.current.handleSlashKeyDown(enterEvent, '/effort');
      });

      expect(actionFn).toHaveBeenCalledTimes(1);
      // Panel stays open and the input is NOT cleared.
      expect(onChange).not.toHaveBeenCalled();
      expect(result.current.showSlashCommands).toBe(true);
    });
  });

  // ──────────────────────────────────────────────────────
  // searchOnly items — hidden by default, surfaced via search
  // ──────────────────────────────────────────────────────

  describe('searchOnly items', () => {
    const sectionsWithSearchOnly: PanelSection[] = [
      {
        id: PanelSectionId.Context,
        title: 'Context',
        showDividerAbove: false,
        items: [
          {
            id: 'normal',
            label: 'Attach file',
            type: PanelItemType.Action,
            action: vi.fn(),
          } as ActionItem,
          {
            id: 'resume',
            label: 'Resume conversation',
            type: PanelItemType.Action,
            searchOnly: true,
            action: vi.fn(),
          } as ActionItem,
        ],
      },
    ];

    it('hides searchOnly items when filterQuery is empty', () => {
      setupMockRegistry(sectionsWithSearchOnly);
      const { result } = renderHook(() =>
        useCommandPalette({ onChange, textareaRef }),
      );

      const items = result.current.filteredSections.flatMap(s => s.items);
      expect(items.find(i => i.id === 'resume')).toBeUndefined();
      expect(items.find(i => i.id === 'normal')).toBeDefined();
    });

    it('surfaces searchOnly items when filterQuery matches the label', () => {
      setupMockRegistry(sectionsWithSearchOnly);
      const { result } = renderHook(() =>
        useCommandPalette({ onChange, textareaRef }),
      );

      act(() => {
        result.current.setFilterQuery('res');
      });

      const items = result.current.filteredSections.flatMap(s => s.items);
      expect(items.find(i => i.id === 'resume')).toBeDefined();
    });

    it('still hides searchOnly items when filterQuery matches a different item', () => {
      setupMockRegistry(sectionsWithSearchOnly);
      const { result } = renderHook(() =>
        useCommandPalette({ onChange, textareaRef }),
      );

      act(() => {
        result.current.setFilterQuery('attach');
      });

      const items = result.current.filteredSections.flatMap(s => s.items);
      expect(items.find(i => i.id === 'resume')).toBeUndefined();
      expect(items.find(i => i.id === 'normal')).toBeDefined();
    });
  });

  // ──────────────────────────────────────────────────────
  // keyword matching — items surface on aliases, not just their label
  // ──────────────────────────────────────────────────────

  describe('keyword matching', () => {
    const sectionsWithKeywords: PanelSection[] = [
      {
        id: PanelSectionId.Settings,
        title: 'Settings',
        showDividerAbove: false,
        items: [
          {
            id: 'switch-account',
            label: 'Switch account',
            type: PanelItemType.Action,
            keywords: ['login'],
            action: vi.fn(),
          } as ActionItem,
        ],
      },
    ];

    it('surfaces an item when the query matches a keyword but not the label', () => {
      setupMockRegistry(sectionsWithKeywords);
      const { result } = renderHook(() =>
        useCommandPalette({ onChange, textareaRef }),
      );

      act(() => {
        result.current.setFilterQuery('login');
      });

      const items = result.current.filteredSections.flatMap(s => s.items);
      expect(items.find(i => i.id === 'switch-account')).toBeDefined();
    });

    it('still hides the item when the query matches neither label nor keyword', () => {
      setupMockRegistry(sectionsWithKeywords);
      const { result } = renderHook(() =>
        useCommandPalette({ onChange, textareaRef }),
      );

      act(() => {
        result.current.setFilterQuery('zzz');
      });

      const items = result.current.filteredSections.flatMap(s => s.items);
      expect(items.find(i => i.id === 'switch-account')).toBeUndefined();
    });
  });

  // ──────────────────────────────────────────────────────
  // description matching — slash commands surface on their description text,
  // not just the command name (issue #167). The CLI ships a description for
  // every command; the terminal matches on it, so the GUI must too.
  // ──────────────────────────────────────────────────────

  describe('description matching (command items)', () => {
    const sectionsWithCommand: PanelSection[] = [
      {
        id: PanelSectionId.SlashCommands,
        title: 'Slash Commands',
        showDividerAbove: false,
        items: [
          {
            id: 'cli-review',
            label: '/review',
            type: PanelItemType.Command,
            name: '/review',
            description: 'Review a GitHub pull request',
            action: vi.fn(),
          } as CommandItem,
          {
            id: 'cli-roadmap',
            label: '/roadmap',
            type: PanelItemType.Command,
            name: '/roadmap',
            description: 'Show the product roadmap',
            action: vi.fn(),
          } as CommandItem,
        ],
      },
    ];

    it('surfaces a command when the query matches its description but not the name', () => {
      setupMockRegistry(sectionsWithCommand);
      const { result } = renderHook(() =>
        useCommandPalette({ onChange, textareaRef }),
      );

      act(() => {
        result.current.setFilterQuery('github');
      });

      const items = result.current.filteredSections.flatMap(s => s.items);
      expect(items.find(i => i.id === 'cli-review')).toBeDefined();
      // The other command's name and description both lack "github".
      expect(items.find(i => i.id === 'cli-roadmap')).toBeUndefined();
    });

    it('still matches on the command name', () => {
      setupMockRegistry(sectionsWithCommand);
      const { result } = renderHook(() =>
        useCommandPalette({ onChange, textareaRef }),
      );

      act(() => {
        result.current.setFilterQuery('road');
      });

      const items = result.current.filteredSections.flatMap(s => s.items);
      expect(items.find(i => i.id === 'cli-roadmap')).toBeDefined();
      expect(items.find(i => i.id === 'cli-review')).toBeUndefined();
    });

    it('hides commands when the query matches neither name nor description', () => {
      setupMockRegistry(sectionsWithCommand);
      const { result } = renderHook(() =>
        useCommandPalette({ onChange, textareaRef }),
      );

      act(() => {
        result.current.setFilterQuery('zzz');
      });

      const items = result.current.filteredSections.flatMap(s => s.items);
      expect(items).toHaveLength(0);
    });

    it('ranks a name match above a description-only match', () => {
      // "/model" matches its own name; "/claude-api" only matches via its
      // description ("...model ids..."). The exact-name command must rank first
      // even though it sorts later alphabetically (regression: /claude-api on top).
      const sections: PanelSection[] = [
        {
          id: PanelSectionId.SlashCommands,
          title: 'Slash Commands',
          showDividerAbove: false,
          items: [
            {
              id: 'cli-claude-api',
              label: '/claude-api',
              type: PanelItemType.Command,
              name: '/claude-api',
              description: 'Reference for the Claude API — model ids, pricing',
              action: vi.fn(),
            } as CommandItem,
            {
              id: 'cli-model',
              label: '/model',
              type: PanelItemType.Command,
              name: '/model',
              description: 'Set the AI model for Claude Code',
              action: vi.fn(),
            } as CommandItem,
          ],
        },
      ];
      setupMockRegistry(sections);
      const { result } = renderHook(() =>
        useCommandPalette({ onChange, textareaRef }),
      );

      act(() => {
        result.current.setFilterQuery('model');
      });

      const items = result.current.filteredSections.flatMap(s => s.items);
      expect(items.map(i => i.id)).toEqual(['cli-model', 'cli-claude-api']);
    });

    it('ranks an earlier (prefix) name match above a later substring match', () => {
      const sections: PanelSection[] = [
        {
          id: PanelSectionId.SlashCommands,
          title: 'Slash Commands',
          showDividerAbove: false,
          items: [
            {
              id: 'cli-remodel',
              label: '/remodel',
              type: PanelItemType.Command,
              name: '/remodel',
              description: '',
              action: vi.fn(),
            } as CommandItem,
            {
              id: 'cli-model',
              label: '/model',
              type: PanelItemType.Command,
              name: '/model',
              description: '',
              action: vi.fn(),
            } as CommandItem,
          ],
        },
      ];
      setupMockRegistry(sections);
      const { result } = renderHook(() =>
        useCommandPalette({ onChange, textareaRef }),
      );

      act(() => {
        result.current.setFilterQuery('model');
      });

      const items = result.current.filteredSections.flatMap(s => s.items);
      // "/model" matches at index 1 (right after "/"), "/remodel" at index 3.
      expect(items.map(i => i.id)).toEqual(['cli-model', 'cli-remodel']);
    });
  });

  // ──────────────────────────────────────────────────────
  // panel-open refresh — reopening the panel refetches the CLI config so
  // runtime-added skills/commands appear without a manual reload (issue #176).
  // The cached list stays visible until the refetch resolves.
  // ──────────────────────────────────────────────────────

  describe('panel-open refresh (issue #176)', () => {
    it('refreshes CLI config when the panel opens via the slash button', () => {
      const { result } = renderHook(() =>
        useCommandPalette({ onChange, textareaRef }),
      );

      expect(mockRefresh).not.toHaveBeenCalled();

      act(() => {
        result.current.handleSlashButtonClick();
      });

      expect(mockRefresh).toHaveBeenCalledTimes(1);
    });

    it('refreshes CLI config when the panel opens via typing "/"', () => {
      const { result } = renderHook(() =>
        useCommandPalette({ onChange, textareaRef }),
      );

      act(() => {
        result.current.detectSlashCommand('/');
      });

      expect(mockRefresh).toHaveBeenCalledTimes(1);
    });

    it('does not refresh again while the panel stays open', () => {
      const { result } = renderHook(() =>
        useCommandPalette({ onChange, textareaRef }),
      );

      act(() => {
        result.current.detectSlashCommand('/');
      });
      // Typing more of the command keeps the panel open — no second refresh.
      act(() => {
        result.current.detectSlashCommand('/re');
      });

      expect(mockRefresh).toHaveBeenCalledTimes(1);
    });
  });

  // ──────────────────────────────────────────────────────
  // detectSlashCommand with arguments — the panel must stay open while typing
  // a command's arguments so "/model sonnet" keeps "/model" selected, instead
  // of vanishing the moment a space is typed.
  // ──────────────────────────────────────────────────────

  describe('detectSlashCommand with arguments', () => {
    it('keeps the panel open and filters by the command name when typing args', () => {
      const { result } = renderHook(() =>
        useCommandPalette({ onChange, textareaRef }),
      );

      act(() => {
        result.current.detectSlashCommand('/model sonnet');
      });

      expect(result.current.showSlashCommands).toBe(true);
      // Filter by the first token ("/model") so the command still matches.
      expect(result.current.filterQuery).toBe('model');
    });

    it('still opens the panel with no args', () => {
      const { result } = renderHook(() =>
        useCommandPalette({ onChange, textareaRef }),
      );

      act(() => {
        result.current.detectSlashCommand('/model');
      });

      expect(result.current.showSlashCommands).toBe(true);
      expect(result.current.filterQuery).toBe('model');
    });

    it('hides the panel when the text does not start with a slash', () => {
      const { result } = renderHook(() =>
        useCommandPalette({ onChange, textareaRef }),
      );

      act(() => {
        result.current.detectSlashCommand('hello world');
      });

      expect(result.current.showSlashCommands).toBe(false);
    });

    // Once an argument is being typed the command is settled, so the panel
    // should narrow to the exact command — not keep showing other fuzzy
    // (description) matches like /claude-api.
    describe('narrows to the exact command in argument mode', () => {
      const modelSections: PanelSection[] = [
        {
          id: PanelSectionId.SlashCommands,
          title: 'Slash Commands',
          showDividerAbove: false,
          items: [
            {
              id: 'cli-model',
              label: '/model',
              type: PanelItemType.Command,
              name: '/model',
              description: 'Set the AI model for Claude Code',
              action: vi.fn(),
            } as CommandItem,
            {
              id: 'cli-claude-api',
              label: '/claude-api',
              type: PanelItemType.Command,
              name: '/claude-api',
              description: 'Reference for the Claude API — model ids',
              action: vi.fn(),
            } as CommandItem,
          ],
        },
      ];

      it('shows only the exact command once an argument is typed', () => {
        setupMockRegistry(modelSections);
        const { result } = renderHook(() =>
          useCommandPalette({ onChange, textareaRef }),
        );

        act(() => {
          result.current.detectSlashCommand('/model so');
        });

        const items = result.current.filteredSections.flatMap(s => s.items);
        expect(items.map(i => i.id)).toEqual(['cli-model']);
      });

      it('still shows fuzzy matches while only the name is being typed', () => {
        setupMockRegistry(modelSections);
        const { result } = renderHook(() =>
          useCommandPalette({ onChange, textareaRef }),
        );

        act(() => {
          result.current.detectSlashCommand('/model');
        });

        const items = result.current.filteredSections.flatMap(s => s.items);
        // description of /claude-api also mentions "model", so it stays visible.
        expect(items.map(i => i.id)).toContain('cli-model');
        expect(items.map(i => i.id)).toContain('cli-claude-api');
      });
    });
  });

  // ──────────────────────────────────────────────────────
  // Issue #236 — the panel yields to the file mention dropdown.
  //
  // Both share one slot above the composer, and the panel used to win purely
  // because the line started with "/". That hid the mention dropdown for every
  // "/command @file" input. The caret decides instead: inside an `@token` the
  // user is picking a file, so the panel steps aside.
  // ──────────────────────────────────────────────────────

  describe('yields to an active @ mention', () => {
    it('closes the panel while the caret sits in an @ token', () => {
      const { result } = renderHook(() =>
        useCommandPalette({ onChange, textareaRef }),
      );

      act(() => {
        result.current.detectSlashCommand('/review');
      });
      expect(result.current.showSlashCommands).toBe(true);

      act(() => {
        result.current.detectSlashCommand('/review @s', 10);
      });

      expect(result.current.showSlashCommands).toBe(false);
    });

    it('stays closed as the mention query grows (no reopen on each keystroke)', () => {
      const { result } = renderHook(() =>
        useCommandPalette({ onChange, textareaRef }),
      );

      act(() => {
        result.current.detectSlashCommand('/review @s', 10);
      });
      act(() => {
        result.current.detectSlashCommand('/review @sr', 11);
      });
      act(() => {
        result.current.detectSlashCommand('/review @src', 12);
      });

      expect(result.current.showSlashCommands).toBe(false);
    });

    it('reopens once a space settles the mention', () => {
      const { result } = renderHook(() =>
        useCommandPalette({ onChange, textareaRef }),
      );

      act(() => {
        result.current.detectSlashCommand('/review @src', 12);
      });
      expect(result.current.showSlashCommands).toBe(false);

      act(() => {
        result.current.detectSlashCommand('/review @src ', 13);
      });

      expect(result.current.showSlashCommands).toBe(true);
      expect(result.current.filterQuery).toBe('review');
    });

    it('keeps the panel open for arguments that are not mentions', () => {
      const { result } = renderHook(() =>
        useCommandPalette({ onChange, textareaRef }),
      );

      act(() => {
        result.current.detectSlashCommand('/model sonnet', 13);
      });

      expect(result.current.showSlashCommands).toBe(true);
      expect(result.current.filterQuery).toBe('model');
    });

    it('keeps the panel open when the caret is back in the command token', () => {
      const { result } = renderHook(() =>
        useCommandPalette({ onChange, textareaRef }),
      );

      // Text holds an @ token but the caret sits inside "/review".
      act(() => {
        result.current.detectSlashCommand('/review @src', 5);
      });

      expect(result.current.showSlashCommands).toBe(true);
    });

    it('ignores an email-like @ and keeps the panel open', () => {
      const { result } = renderHook(() =>
        useCommandPalette({ onChange, textareaRef }),
      );

      act(() => {
        result.current.detectSlashCommand('/review fred@01republic.io', 26);
      });

      expect(result.current.showSlashCommands).toBe(true);
    });

    it('reopens after a mention is inserted, with the caret past the token', () => {
      const { result } = renderHook(() =>
        useCommandPalette({ onChange, textareaRef }),
      );

      act(() => {
        result.current.detectSlashCommand('/review @s', 10);
      });
      expect(result.current.showSlashCommands).toBe(false);

      // selectResult replaces "@s" with "@src/ " and parks the caret after it,
      // which settles the mention — the command panel owns the slot again.
      act(() => {
        result.current.detectSlashCommand('/review @src/ ', 14);
      });

      expect(result.current.showSlashCommands).toBe(true);
      expect(result.current.filterQuery).toBe('review');
    });

    it('opens the panel when the caret argument is omitted (back-compat)', () => {
      const { result } = renderHook(() =>
        useCommandPalette({ onChange, textareaRef }),
      );

      // Callers that do not track a caret keep the pre-#236 behaviour.
      act(() => {
        result.current.detectSlashCommand('/review');
      });

      expect(result.current.showSlashCommands).toBe(true);
    });
  });

  // ──────────────────────────────────────────────────────
  // Issue #244 — a "/" typed after existing text must open the panel too.
  //
  // The panel only ever checked `value.startsWith('/')`, so once a prompt had
  // been started there was no way to reach a skill or a CLI command. The
  // trigger now mirrors the mention one: a "/" starting a line or following a
  // space, with the caret still inside the token.
  // ──────────────────────────────────────────────────────

  describe('slash typed mid-input (issue #244)', () => {
    it('opens the panel for a "/" typed after existing text', () => {
      const { result } = renderHook(() =>
        useCommandPalette({ onChange, textareaRef }),
      );

      act(() => {
        result.current.detectSlashCommand('explain this /', 14);
      });

      expect(result.current.showSlashCommands).toBe(true);
      expect(result.current.filterQuery).toBe('');
    });

    it('filters by the command name typed mid-input', () => {
      const { result } = renderHook(() =>
        useCommandPalette({ onChange, textareaRef }),
      );

      act(() => {
        result.current.detectSlashCommand('explain this /rev', 17);
      });

      expect(result.current.showSlashCommands).toBe(true);
      expect(result.current.filterQuery).toBe('rev');
    });

    it('does not enter argument mode for a mid-input command', () => {
      // argMode narrows to an exact name match. The leading prose contains a
      // space, so keying off "input has whitespace" would wrongly lock the
      // filter and hide every fuzzy match.
      setupMockRegistry([
        {
          id: PanelSectionId.SlashCommands,
          title: 'Slash Commands',
          showDividerAbove: false,
          items: [
            {
              id: 'cli-model',
              label: '/model',
              type: PanelItemType.Command,
              name: '/model',
              description: 'Set the AI model',
              action: vi.fn(),
            } as CommandItem,
          ],
        },
      ]);
      const { result } = renderHook(() =>
        useCommandPalette({ onChange, textareaRef }),
      );

      act(() => {
        result.current.detectSlashCommand('explain this /mod', 17);
      });

      const items = result.current.filteredSections.flatMap(s => s.items);
      expect(items.map(i => i.id)).toEqual(['cli-model']);
    });

    it('closes the panel once a space settles the mid-input command', () => {
      const { result } = renderHook(() =>
        useCommandPalette({ onChange, textareaRef }),
      );

      act(() => {
        result.current.detectSlashCommand('explain this /rev', 17);
      });
      expect(result.current.showSlashCommands).toBe(true);

      act(() => {
        result.current.detectSlashCommand('explain this /rev ', 18);
      });

      expect(result.current.showSlashCommands).toBe(false);
    });

    it('leaves a path-like "/" alone', () => {
      const { result } = renderHook(() =>
        useCommandPalette({ onChange, textareaRef }),
      );

      act(() => {
        result.current.detectSlashCommand('see src/utils', 13);
      });

      expect(result.current.showSlashCommands).toBe(false);
    });

    it('still opens for a leading command with the caret inside it', () => {
      const { result } = renderHook(() =>
        useCommandPalette({ onChange, textareaRef }),
      );

      act(() => {
        result.current.detectSlashCommand('/review', 7);
      });

      expect(result.current.showSlashCommands).toBe(true);
      expect(result.current.filterQuery).toBe('review');
    });
  });

  // ──────────────────────────────────────────────────────
  // Issue #244 — picking an item mid-input inserts text instead of running.
  //
  // A command chosen from an otherwise empty composer runs immediately (it is
  // the whole message). One chosen after existing prose is part of a sentence
  // the user is still writing, so it is only completed into the input — running
  // it there would both discard the prose and send a half-written message.
  // ──────────────────────────────────────────────────────

  describe('executing an item picked mid-input (issue #244)', () => {
    const commandSections: PanelSection[] = [
      {
        id: PanelSectionId.SlashCommands,
        title: 'Slash Commands',
        showDividerAbove: false,
        items: [
          {
            id: 'cli-review',
            label: '/review',
            type: PanelItemType.Command,
            name: '/review',
            description: 'Review a pull request',
            action: vi.fn(),
          } as CommandItem,
        ],
      },
    ];

    function firstItem(sections: PanelSection[]) {
      return sections[0].items[0];
    }

    it('completes the command into the input without running it', () => {
      setupMockRegistry(commandSections);
      const { result } = renderHook(() =>
        useCommandPalette({ onChange, textareaRef }),
      );
      const item = firstItem(commandSections) as CommandItem;

      act(() => {
        result.current.detectSlashCommand('explain this /rev', 17);
      });
      act(() => {
        result.current.handlePanelItemExecute(item);
      });

      // The prose survives and the token is completed to the full name.
      expect(onChange).toHaveBeenCalledWith('explain this /review ');
      expect(item.action).not.toHaveBeenCalled();
      expect(result.current.showSlashCommands).toBe(false);
    });

    it('still runs and clears for a command that is the whole input', () => {
      setupMockRegistry(commandSections);
      const { result } = renderHook(() =>
        useCommandPalette({ onChange, textareaRef }),
      );
      const item = firstItem(commandSections) as CommandItem;

      act(() => {
        result.current.detectSlashCommand('/rev', 4);
      });
      act(() => {
        result.current.handlePanelItemExecute(item);
      });

      expect(item.action).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith('');
    });

    it('completes on Enter as well as on click', () => {
      setupMockRegistry(commandSections);
      const { result } = renderHook(() =>
        useCommandPalette({ onChange, textareaRef }),
      );
      const item = firstItem(commandSections) as CommandItem;

      act(() => {
        result.current.detectSlashCommand('explain this /rev', 17);
      });
      act(() => {
        result.current.handleSlashKeyDown(
          {
            key: 'Enter',
            shiftKey: false,
            preventDefault: vi.fn(),
            nativeEvent: { isComposing: false },
          } as any,
          'explain this /rev',
        );
      });

      expect(onChange).toHaveBeenCalledWith('explain this /review ');
      expect(item.action).not.toHaveBeenCalled();
    });

    it('keeps text that follows the token', () => {
      setupMockRegistry(commandSections);
      const { result } = renderHook(() =>
        useCommandPalette({ onChange, textareaRef }),
      );
      const item = firstItem(commandSections) as CommandItem;

      // Caret sits at the end of "/rev"; " please" trails behind it.
      act(() => {
        result.current.detectSlashCommand('explain this /rev please', 17);
      });
      act(() => {
        result.current.handlePanelItemExecute(item);
      });

      expect(onChange).toHaveBeenCalledWith('explain this /review please');
    });

    it('completes the mid-input token on Tab without mangling the prose', () => {
      // Tab completes against the first space in the whole input, which is the
      // command's own separator only when the command leads the line.
      setupMockRegistry(commandSections);
      const { result } = renderHook(() =>
        useCommandPalette({ onChange, textareaRef }),
      );

      act(() => {
        result.current.detectSlashCommand('explain this /rev', 17);
      });
      act(() => {
        result.current.handleSlashKeyDown(
          {
            key: 'Tab',
            shiftKey: false,
            preventDefault: vi.fn(),
            nativeEvent: { isComposing: false },
          } as any,
          'explain this /rev',
        );
      });

      expect(onChange).toHaveBeenCalledWith('explain this /review ');
    });

    it('still completes a leading command on Tab', () => {
      setupMockRegistry(commandSections);
      const { result } = renderHook(() =>
        useCommandPalette({ onChange, textareaRef }),
      );

      act(() => {
        result.current.detectSlashCommand('/rev');
      });
      act(() => {
        result.current.handleSlashKeyDown(
          {
            key: 'Tab',
            shiftKey: false,
            preventDefault: vi.fn(),
            nativeEvent: { isComposing: false },
          } as any,
          '/rev',
        );
      });

      expect(onChange).toHaveBeenCalledWith('/review ');
    });

    it('runs (not completes) after the panel is reopened from the toolbar button', () => {
      // The toolbar "/" button opens the panel without going through the caret
      // check, so a token left over from earlier typing must not be reused —
      // the same blind spot the mention guard hit in #236.
      setupMockRegistry(commandSections);
      const { result } = renderHook(() =>
        useCommandPalette({ onChange, textareaRef }),
      );
      const item = firstItem(commandSections) as CommandItem;

      act(() => {
        result.current.detectSlashCommand('explain this /rev', 17);
      });
      act(() => {
        result.current.closePanel();
      });
      act(() => {
        result.current.handleSlashButtonClick();
      });
      act(() => {
        result.current.handlePanelItemExecute(item);
      });

      expect(item.action).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith('');
    });

    it('reports where the caret belongs after completing', () => {
      // The composer must park the caret past the inserted name (and its
      // separator) so the user can type arguments straight away.
      setupMockRegistry(commandSections);
      const onCompleteInline = vi.fn<(value: string, caretOffset: number) => void>();
      const { result } = renderHook(() =>
        useCommandPalette({ onChange, textareaRef, onCompleteInline }),
      );
      const item = firstItem(commandSections) as CommandItem;

      act(() => {
        result.current.detectSlashCommand('explain this /rev', 17);
      });
      act(() => {
        result.current.handlePanelItemExecute(item);
      });

      // "explain this /review " → caret sits at the end, past the space.
      expect(onCompleteInline).toHaveBeenCalledWith('explain this /review ', 21);
    });

    it('parks the caret past the existing space when one already follows', () => {
      setupMockRegistry(commandSections);
      const onCompleteInline = vi.fn<(value: string, caretOffset: number) => void>();
      const { result } = renderHook(() =>
        useCommandPalette({ onChange, textareaRef, onCompleteInline }),
      );
      const item = firstItem(commandSections) as CommandItem;

      act(() => {
        result.current.detectSlashCommand('explain this /rev please', 17);
      });
      act(() => {
        result.current.handlePanelItemExecute(item);
      });

      // No second space is inserted, and the caret still lands after the one
      // that is there — ready to type, not stranded before it.
      expect(onCompleteInline).toHaveBeenCalledWith('explain this /review please', 21);
    });

    it('runs a non-command action item even mid-input', () => {
      // Action items (e.g. "Switch model…") are settings, not message text —
      // completing them into the prompt would be meaningless.
      const actionSections: PanelSection[] = [
        {
          id: PanelSectionId.Model,
          title: 'Model',
          showDividerAbove: false,
          items: [
            {
              id: 'model-action',
              label: 'Switch model…',
              type: PanelItemType.Action,
              action: vi.fn(),
            } as ActionItem,
          ],
        },
      ];
      setupMockRegistry(actionSections);
      const { result } = renderHook(() =>
        useCommandPalette({ onChange, textareaRef }),
      );
      const item = firstItem(actionSections) as ActionItem;

      act(() => {
        result.current.detectSlashCommand('explain this /switch', 20);
      });
      act(() => {
        result.current.handlePanelItemExecute(item);
      });

      expect(item.action).toHaveBeenCalledTimes(1);
    });
  });
});
