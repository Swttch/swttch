import { useCallback } from 'react';
import { useSettings, useSettingsOrNull } from '@/contexts/SettingsContext';
import { useClaudeSettings, useClaudeSettingsOrNull } from '@/contexts/ClaudeSettingsContext';
import type { SettingsState } from '@/types/settings';
import type { ClaudeSettingsState } from '@/types/claude-settings';

/**
 * Whether a save leaves the effective value untouched because a project setting
 * already claims that key.
 *
 * Settings resolve global → project, so a global save only changes what the user
 * sees when the project has not taken the key over. Optimistically showing it
 * anyway is what made a global change look applied until the next reload, which
 * reads as "the setting is not being saved" (issue #344).
 *
 * `overrides` is the key list that rides along with every merged settings read —
 * both the app's own settings and Claude's — so this needs no state of its own.
 */
export function isShadowedByProject(
  key: string,
  targetScope: 'global' | 'project',
  overrides: string[] | undefined,
): boolean {
  return targetScope === 'global' && (overrides ?? []).includes(key);
}

/**
 * A predicate for "the open project overrides this key, as seen from the global
 * scope" — what a settings row uses to say the value on screen is not the one in
 * effect, and to stop accepting edits that would change nothing.
 *
 * One hook returning a function rather than one hook per key: a section renders
 * up to five rows, and the keys are known only per row.
 *
 * Absent context reads as "nothing is overridden". This drives a hint on top of
 * a row, so it must never be the reason a settings screen fails to render.
 */
export function useIsOverriddenByProject(): (key: string | undefined) => boolean {
  const settings = useSettingsOrNull();
  const claudeSettings = useClaudeSettingsOrNull();
  const scope = settings?.scope;
  const overrides = settings?.overrides;
  const claudeOverrides = claudeSettings?.overrides;

  return useCallback(
    (key: string | undefined) => {
      if (!key) return false;
      // On the project tab the value on screen is already the winning one, so
      // there is nothing to flag — this is about editing the scope that loses.
      if (scope !== 'global') return false;
      return (overrides ?? []).includes(key) || (claudeOverrides ?? []).includes(key);
    },
    [scope, overrides, claudeOverrides],
  );
}

type Scope = 'global' | 'project';

/**
 * What the open settings tab should draw for a row.
 *
 * The global tab shows the global file, which the backend reads with the
 * built-in defaults laid underneath. The project tab cannot show its own file:
 * that file holds only the keys the project overrides, so a key it leaves out
 * reads as "nothing" and a row falls back to its own constant. A project that
 * says nothing about a key uses the global value, and that is what the tab has
 * to show. The merged settings are exactly that chain, defaults then global
 * then project, resolved key by key (#547).
 *
 * Scope is read as "global" when a caller gives none, so a screen that has no
 * scope switch still gets the open tab's own values.
 */
export function pickDisplayedSettings<T extends object>(
  scope: Scope | undefined,
  scopeSettings: Partial<T>,
  merged: Partial<T> | undefined,
): Partial<T> {
  return scope === 'project' ? { ...(merged ?? {}), ...scopeSettings } : scopeSettings;
}

/**
 * Whether the value on screen is inherited: the project tab is open and the
 * project's own file has nothing for [key]. Only the project tab can inherit,
 * and a key stored as null counts as absent, which is how a removed override is
 * written.
 */
export function isInheritedFromGlobal(
  scope: Scope | undefined,
  scopeSettings: object,
  key: string,
): boolean {
  if (scope !== 'project') return false;
  const own = (scopeSettings as Record<string, unknown>)[key];
  return own === undefined || own === null;
}

/** What a row of one settings store draws, and whether that value is inherited. */
export interface DisplayedSettings<T> {
  displaySettings: Partial<T>;
  isInherited: (key: string) => boolean;
  /**
   * The action behind the reset link on a row whose project value overrides the
   * global one: it deletes [key] from the project file, plus any [alsoRemove]
   * keys that only make sense next to it. Undefined when there is nothing to
   * take back, which is also how a row learns not to draw the badge.
   */
  resetFor: (key: string, ...alsoRemove: string[]) => (() => void) | undefined;
}

function resetForKeys(
  scope: Scope | undefined,
  scopeSettings: object,
  resetToGlobal: (key: never) => Promise<void>,
) {
  return (key: string, ...alsoRemove: string[]) => {
    if (scope !== 'project' || isInheritedFromGlobal(scope, scopeSettings, key)) return undefined;
    return () => {
      for (const k of [key, ...alsoRemove]) void resetToGlobal(k as never);
    };
  };
}

/** {@link pickDisplayedSettings} for the app's own settings (settings.js). */
export function useDisplaySettings(): DisplayedSettings<SettingsState> {
  const { scope, scopeSettings, settings, resetToGlobal } = useSettings();
  return {
    displaySettings: pickDisplayedSettings<SettingsState>(scope, scopeSettings, settings),
    isInherited: (key) => isInheritedFromGlobal(scope, scopeSettings, key),
    resetFor: resetForKeys(scope, scopeSettings, resetToGlobal),
  };
}

/** {@link pickDisplayedSettings} for Claude Code's own settings (settings.json). */
export function useClaudeDisplaySettings(): DisplayedSettings<ClaudeSettingsState> {
  const { scope, scopeSettings, settings, resetToGlobal } = useClaudeSettings();
  return {
    displaySettings: pickDisplayedSettings<ClaudeSettingsState>(scope, scopeSettings, settings),
    isInherited: (key) => isInheritedFromGlobal(scope, scopeSettings, key),
    resetFor: resetForKeys(scope, scopeSettings, resetToGlobal),
  };
}
