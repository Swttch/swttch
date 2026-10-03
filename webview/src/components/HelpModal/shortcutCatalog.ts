import { composerBindings } from '@/utils/composerShortcut';
import type { ComposerShortcutSettings } from '@/shared';
import { keyCapsFor } from './keyCombo';

/** The sections the shortcut list is divided into, in the order they appear. */
export enum ShortcutGroup {
  General = 'general',
  ChatInput = 'chatInput',
  TextEditing = 'textEditing',
  Emacs = 'emacs',
}

/** Stable names for the rows, so a test or a translation can point at one. */
export enum ShortcutId {
  OpenHelp = 'openHelp',
  NewTab = 'newTab',
  OpenSettings = 'openSettings',
  OpenModelMenu = 'openModelMenu',
  RotateModel = 'rotateModel',
  ClearConversation = 'clearConversation',
  ZoomIn = 'zoomIn',
  ZoomOut = 'zoomOut',
  ZoomReset = 'zoomReset',
  RefreshSessionList = 'refreshSessionList',
  SendMessage = 'sendMessage',
  InsertNewline = 'insertNewline',
  CyclePermissionMode = 'cyclePermissionMode',
  RecallPrompt = 'recallPrompt',
  ToggleDictation = 'toggleDictation',
  InsertEditorPath = 'insertEditorPath',
  OpenClaudeCode = 'openClaudeCode',
  LineEdges = 'lineEdges',
  TextStart = 'textStart',
  TextEnd = 'textEnd',
  WordMove = 'wordMove',
  EmacsParagraphEdges = 'emacsParagraphEdges',
  EmacsCharacterMove = 'emacsCharacterMove',
  EmacsLineMove = 'emacsLineMove',
  EmacsDelete = 'emacsDelete',
  EmacsKill = 'emacsKill',
  EmacsYank = 'emacsYank',
  EmacsTranspose = 'emacsTranspose',
  EmacsOpenLine = 'emacsOpenLine',
  EmacsPageDown = 'emacsPageDown',
  EmacsCenter = 'emacsCenter',
}

/** Everything a row may depend on when it decides what to show. */
export interface ShortcutContext {
  /** True on macOS, where Cmd is the primary modifier and symbols are used. */
  mac: boolean;
  /** True inside a JetBrains IDE, where the IDE's own shortcuts exist. */
  ideAttached: boolean;
  /** The send and newline choices the user made in settings. */
  composer: ComposerShortcutSettings;
  /** The voice input shortcut, or null when voice input is off or unbound. */
  voiceShortcut: string | null;
}

/**
 * The combinations that do the job on this machine, in the combo spelling
 * {@link keyCapsFor} reads. Empty when the row has nothing true to say here.
 */
export type ShortcutKeys = (context: ShortcutContext) => readonly string[];

export interface ShortcutEntry {
  id: ShortcutId;
  group: ShortcutGroup;
  /** Key in common.json describing what the shortcut does. */
  descriptionKey: string;
  keys: ShortcutKeys;
  /** Shown on macOS only: the key does nothing, or is native, elsewhere. */
  macOnly?: boolean;
  /** Shown inside a JetBrains IDE only: the IDE is what owns the key. */
  ideOnly?: boolean;
}

const fixed =
  (...combos: string[]): ShortcutKeys =>
  () =>
    combos;

/** A row that only exists on macOS, where the same keys are the OS's own. */
const emacs = (
  id: ShortcutId,
  descriptionKey: string,
  ...combos: string[]
): ShortcutEntry => ({
  id,
  group: ShortcutGroup.Emacs,
  descriptionKey,
  keys: fixed(...combos),
  macOnly: true,
});

/**
 * Which of several bindings to name. `modEnter` binds both Ctrl+Enter and
 * Cmd+Enter, and naming the one the keyboard does not have helps nobody, so the
 * platform's own is preferred.
 */
function bindingForPlatform(bindings: readonly string[], mac: boolean): readonly string[] {
  if (bindings.length === 0) return [];
  const preferred = bindings.find((stored) => stored.startsWith(mac ? 'Meta+' : 'Ctrl+'));
  return [preferred ?? bindings[0]];
}

const sendKeys: ShortcutKeys = ({ composer, mac }) =>
  bindingForPlatform(composerBindings(composer).send, mac);

const newlineKeys: ShortcutKeys = ({ composer, mac }) =>
  bindingForPlatform(composerBindings(composer).newline, mac);

/**
 * Windows and Linux have no rows for the Cmd+Arrow keys: Home/End and Ctrl+Arrow
 * already do the same in every text field there.
 *
 * Cmd+Up does not reach the page inside a JetBrains IDE, where the IDE takes it
 * for its navigation bar first (see caretBoundaryKey), so it is not promised there.
 */
const textStartKeys: ShortcutKeys = ({ ideAttached }) => (ideAttached ? [] : ['Mod+ArrowUp']);

/** Option+Arrow on macOS is the word move that Ctrl+Arrow is elsewhere. */
const wordKeys: ShortcutKeys = ({ mac }) =>
  mac ? ['Alt+ArrowLeft', 'Alt+ArrowRight'] : ['Ctrl+ArrowLeft', 'Ctrl+ArrowRight'];

const voiceKeys: ShortcutKeys = ({ voiceShortcut }) => (voiceShortcut ? [voiceShortcut] : []);

const k = (key: string) => `helpModal.shortcuts.${key}`;

/** Every shortcut the help modal can list, in the order they appear in a group. */
export const SHORTCUT_CATALOG: readonly ShortcutEntry[] = [
  { id: ShortcutId.OpenHelp, group: ShortcutGroup.General, descriptionKey: k('openHelp'), keys: fixed('Mod+/') },
  { id: ShortcutId.NewTab, group: ShortcutGroup.General, descriptionKey: k('newTab'), keys: fixed('Mod+N') },
  { id: ShortcutId.OpenSettings, group: ShortcutGroup.General, descriptionKey: k('openSettings'), keys: fixed('Mod+,') },
  { id: ShortcutId.OpenModelMenu, group: ShortcutGroup.General, descriptionKey: k('openModelMenu'), keys: fixed('Mod+Shift+M') },
  { id: ShortcutId.RotateModel, group: ShortcutGroup.General, descriptionKey: k('rotateModel'), keys: fixed('Mod+Shift+.') },
  { id: ShortcutId.ClearConversation, group: ShortcutGroup.General, descriptionKey: k('clearConversation'), keys: fixed('Mod+Shift+C') },
  { id: ShortcutId.RefreshSessionList, group: ShortcutGroup.General, descriptionKey: k('refreshSessionList'), keys: fixed('Mod+Shift+P') },
  { id: ShortcutId.ZoomIn, group: ShortcutGroup.General, descriptionKey: k('zoomIn'), keys: fixed('Mod++') },
  { id: ShortcutId.ZoomOut, group: ShortcutGroup.General, descriptionKey: k('zoomOut'), keys: fixed('Mod+-') },
  { id: ShortcutId.ZoomReset, group: ShortcutGroup.General, descriptionKey: k('zoomReset'), keys: fixed('Mod+0') },
  { id: ShortcutId.OpenClaudeCode, group: ShortcutGroup.General, descriptionKey: k('openClaudeCode'), keys: fixed('Ctrl+Shift+C'), ideOnly: true },

  { id: ShortcutId.SendMessage, group: ShortcutGroup.ChatInput, descriptionKey: k('sendMessage'), keys: sendKeys },
  { id: ShortcutId.InsertNewline, group: ShortcutGroup.ChatInput, descriptionKey: k('insertNewline'), keys: newlineKeys },
  { id: ShortcutId.CyclePermissionMode, group: ShortcutGroup.ChatInput, descriptionKey: k('cyclePermissionMode'), keys: fixed('Shift+Tab') },
  { id: ShortcutId.RecallPrompt, group: ShortcutGroup.ChatInput, descriptionKey: k('recallPrompt'), keys: fixed('ArrowUp', 'ArrowDown') },
  { id: ShortcutId.ToggleDictation, group: ShortcutGroup.ChatInput, descriptionKey: k('toggleDictation'), keys: voiceKeys },
  { id: ShortcutId.InsertEditorPath, group: ShortcutGroup.ChatInput, descriptionKey: k('insertEditorPath'), keys: fixed('Alt+K'), ideOnly: true },

  { id: ShortcutId.LineEdges, group: ShortcutGroup.TextEditing, descriptionKey: k('lineEdges'), keys: fixed('Mod+ArrowLeft', 'Mod+ArrowRight'), macOnly: true },
  { id: ShortcutId.TextStart, group: ShortcutGroup.TextEditing, descriptionKey: k('textStart'), keys: textStartKeys, macOnly: true },
  { id: ShortcutId.TextEnd, group: ShortcutGroup.TextEditing, descriptionKey: k('textEnd'), keys: fixed('Mod+ArrowDown'), macOnly: true },
  { id: ShortcutId.WordMove, group: ShortcutGroup.TextEditing, descriptionKey: k('wordMove'), keys: wordKeys },

  emacs(ShortcutId.EmacsParagraphEdges, k('emacsParagraphEdges'), 'Ctrl+A', 'Ctrl+E'),
  emacs(ShortcutId.EmacsCharacterMove, k('emacsCharacterMove'), 'Ctrl+B', 'Ctrl+F'),
  emacs(ShortcutId.EmacsLineMove, k('emacsLineMove'), 'Ctrl+P', 'Ctrl+N'),
  emacs(ShortcutId.EmacsDelete, k('emacsDelete'), 'Ctrl+D', 'Ctrl+H'),
  emacs(ShortcutId.EmacsKill, k('emacsKill'), 'Ctrl+K'),
  emacs(ShortcutId.EmacsYank, k('emacsYank'), 'Ctrl+Y'),
  emacs(ShortcutId.EmacsTranspose, k('emacsTranspose'), 'Ctrl+T'),
  emacs(ShortcutId.EmacsOpenLine, k('emacsOpenLine'), 'Ctrl+O'),
  emacs(ShortcutId.EmacsPageDown, k('emacsPageDown'), 'Ctrl+V'),
  emacs(ShortcutId.EmacsCenter, k('emacsCenter'), 'Ctrl+L'),
];

/** A group as drawn: its title, and the note that sits under the title if any. */
export interface ShortcutGroupMeta {
  group: ShortcutGroup;
  titleKey: string;
  noteKey?: string;
}

/** The groups in display order. */
export const SHORTCUT_GROUPS: readonly ShortcutGroupMeta[] = [
  { group: ShortcutGroup.General, titleKey: 'helpModal.groups.general' },
  { group: ShortcutGroup.ChatInput, titleKey: 'helpModal.groups.chatInput' },
  { group: ShortcutGroup.TextEditing, titleKey: 'helpModal.groups.textEditing' },
  { group: ShortcutGroup.Emacs, titleKey: 'helpModal.groups.emacs', noteKey: 'helpModal.groupNotes.emacs' },
];

/** A row ready to draw: the key caps of each combination are already resolved. */
export interface VisibleShortcut {
  id: ShortcutId;
  group: ShortcutGroup;
  descriptionKey: string;
  /** One list of key caps per combination. */
  combos: string[][];
}

/**
 * The rows that are true for this machine.
 *
 * A row is dropped when it belongs to another platform or to the IDE, and also
 * when it resolves to no keys at all: a send key the user never recorded, voice
 * input turned off. Showing those would describe a key that does nothing.
 */
export function visibleShortcuts(context: ShortcutContext): VisibleShortcut[] {
  const rows: VisibleShortcut[] = [];
  for (const entry of SHORTCUT_CATALOG) {
    if (entry.macOnly && !context.mac) continue;
    if (entry.ideOnly && !context.ideAttached) continue;

    const combos = entry
      .keys(context)
      .map((combo) => keyCapsFor(combo, context.mac))
      .filter((caps) => caps.length > 0);
    if (combos.length === 0) continue;

    rows.push({ id: entry.id, group: entry.group, descriptionKey: entry.descriptionKey, combos });
  }
  return rows;
}
