import { describe, it, expect } from 'vitest';
import { ComposerNewlineShortcut, ComposerSendShortcut } from '@/shared';
import enCommon from '@/i18n/locales/en/common.json';
import koCommon from '@/i18n/locales/ko/common.json';
import {
  SHORTCUT_CATALOG,
  SHORTCUT_GROUPS,
  ShortcutGroup,
  ShortcutId,
  visibleShortcuts,
  type ShortcutContext,
} from '../shortcutCatalog';

const base: ShortcutContext = {
  mac: true,
  ideAttached: false,
  composer: {},
  voiceShortcut: 'Alt+D',
};

const ctx = (patch: Partial<ShortcutContext>): ShortcutContext => ({ ...base, ...patch });

const idsOf = (context: ShortcutContext) => visibleShortcuts(context).map((row) => row.id);

const lookup = (catalog: object, dotted: string): string | undefined => {
  let node: object | string | undefined = catalog;
  for (const part of dotted.split('.')) {
    if (typeof node !== 'object' || node === null) return undefined;
    node = (node as Record<string, object | string | undefined>)[part];
  }
  return typeof node === 'string' ? node : undefined;
};

describe('SHORTCUT_CATALOG', () => {
  it('gives every entry its own id', () => {
    const ids = SHORTCUT_CATALOG.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.sort()).toEqual(Object.values(ShortcutId).sort());
  });

  it('has a description in English and Korean for every entry', () => {
    for (const entry of SHORTCUT_CATALOG) {
      expect(lookup(enCommon, entry.descriptionKey), entry.descriptionKey).toBeTruthy();
      expect(lookup(koCommon, entry.descriptionKey), entry.descriptionKey).toBeTruthy();
    }
  });

  it('has a title (and a note, where one is named) for every group', () => {
    expect(SHORTCUT_GROUPS.map((g) => g.group)).toEqual(Object.values(ShortcutGroup));
    for (const meta of SHORTCUT_GROUPS) {
      expect(lookup(enCommon, meta.titleKey), meta.titleKey).toBeTruthy();
      expect(lookup(koCommon, meta.titleKey), meta.titleKey).toBeTruthy();
      if (meta.noteKey) {
        expect(lookup(enCommon, meta.noteKey), meta.noteKey).toBeTruthy();
        expect(lookup(koCommon, meta.noteKey), meta.noteKey).toBeTruthy();
      }
    }
  });
});

describe('visibleShortcuts', () => {
  it('shows the macOS-only rows on macOS and hides them elsewhere', () => {
    expect(idsOf(ctx({ mac: true }))).toContain(ShortcutId.EmacsKill);
    expect(idsOf(ctx({ mac: true }))).toContain(ShortcutId.LineEdges);
    expect(idsOf(ctx({ mac: false }))).not.toContain(ShortcutId.EmacsKill);
    expect(idsOf(ctx({ mac: false }))).not.toContain(ShortcutId.LineEdges);
    expect(visibleShortcuts(ctx({ mac: false })).some((r) => r.group === ShortcutGroup.Emacs)).toBe(false);
  });

  it('shows the IDE-only rows only when an IDE is attached', () => {
    const inIde = idsOf(ctx({ ideAttached: true }));
    const inBrowser = idsOf(ctx({ ideAttached: false }));
    expect(inIde).toEqual(expect.arrayContaining([ShortcutId.InsertEditorPath, ShortcutId.OpenClaudeCode]));
    expect(inBrowser).not.toContain(ShortcutId.InsertEditorPath);
    expect(inBrowser).not.toContain(ShortcutId.OpenClaudeCode);
  });

  it('does not promise Cmd+Up inside an IDE, where the IDE takes it first', () => {
    expect(idsOf(ctx({ ideAttached: true }))).not.toContain(ShortcutId.TextStart);
    expect(idsOf(ctx({ ideAttached: false }))).toContain(ShortcutId.TextStart);
  });

  it('resolves the platform modifier in the combos', () => {
    const find = (context: ShortcutContext, id: ShortcutId) =>
      visibleShortcuts(context).find((row) => row.id === id)?.combos;
    expect(find(ctx({ mac: true }), ShortcutId.OpenHelp)).toEqual([['⌘', '/']]);
    expect(find(ctx({ mac: false }), ShortcutId.OpenHelp)).toEqual([['Ctrl', '/']]);
  });

  it('follows the composer settings for send and newline', () => {
    const find = (context: ShortcutContext, id: ShortcutId) =>
      visibleShortcuts(context).find((row) => row.id === id)?.combos;

    expect(find(base, ShortcutId.SendMessage)).toEqual([['↩']]);
    expect(find(base, ShortcutId.InsertNewline)).toEqual([['⇧', '↩']]);

    const modEnter = {
      composerSendShortcut: ComposerSendShortcut.ModEnter,
      composerNewlineShortcut: ComposerNewlineShortcut.Enter,
    };
    expect(find(ctx({ composer: modEnter }), ShortcutId.SendMessage)).toEqual([['⌘', '↩']]);
    expect(find(ctx({ composer: modEnter, mac: false }), ShortcutId.SendMessage)).toEqual([['Ctrl', '↵']]);
    expect(find(ctx({ composer: modEnter }), ShortcutId.InsertNewline)).toEqual([['↩']]);

    const custom = {
      composerSendShortcut: ComposerSendShortcut.Custom,
      composerSendShortcutCustom: 'Alt+Enter',
    };
    expect(find(ctx({ composer: custom }), ShortcutId.SendMessage)).toEqual([['⌥', '↩']]);
  });

  it('hides a send or newline row whose custom key was never recorded', () => {
    const unrecorded = {
      composerSendShortcut: ComposerSendShortcut.Custom,
      composerNewlineShortcut: ComposerNewlineShortcut.Custom,
    };
    const ids = idsOf(ctx({ composer: unrecorded }));
    expect(ids).not.toContain(ShortcutId.SendMessage);
    expect(ids).not.toContain(ShortcutId.InsertNewline);
  });

  it('shows the configured voice shortcut, and hides the row when there is none', () => {
    const find = (context: ShortcutContext) =>
      visibleShortcuts(context).find((row) => row.id === ShortcutId.ToggleDictation)?.combos;
    expect(find(ctx({ voiceShortcut: 'Alt+V' }))).toEqual([['⌥', 'V']]);
    expect(find(ctx({ voiceShortcut: null }))).toBeUndefined();
  });

  it('gives Windows and Linux the word-wise keys they have natively', () => {
    const word = visibleShortcuts(ctx({ mac: false })).find((r) => r.id === ShortcutId.WordMove);
    expect(word?.combos).toEqual([
      ['Ctrl', '←'],
      ['Ctrl', '→'],
    ]);
  });
});
