import { useCallback } from 'react';
import { useSettingsOrNull } from '@/contexts/SettingsContext';
import { useClaudeSettingsOrNull } from '@/contexts/ClaudeSettingsContext';

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
