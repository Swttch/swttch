import { useSettings } from '@/contexts/SettingsContext';
import { SettingKey, DiffSurface } from '@/types/settings';

/**
 * Which surface will actually draw the next review diff.
 *
 * The stored setting is a preference, not an answer: it can name the IDE on a
 * backend no IDE is hosting, where there is nothing to open. `ideAttached`
 * decides whether that preference can be honoured, and when it cannot the
 * built-in surface is the answer — every host can draw that one.
 *
 * Note this is about the BACKEND's host, not the client's: a browser attached
 * through the tunnel to an IDE-hosted backend still gets the IDE's diff, which
 * opens on the machine running the IDE.
 *
 * Shared rather than repeated so the settings screen, the approval prompt and
 * anything else that opens a diff cannot drift into disagreeing about where it
 * goes.
 */
export function useResolvedDiffSurface(): DiffSurface {
  const { scopeSettings, ideAttached } = useSettings();
  if (!ideAttached) return DiffSurface.BUILT_IN;
  return (scopeSettings[SettingKey.DIFF_SURFACE] as DiffSurface | undefined) ?? DiffSurface.IDE;
}

/**
 * Whether the next review diff opens in the IDE's own viewer.
 *
 * Kept as its own name because most callers only care about this one surface —
 * the approval prompt's file link, for instance, offers the IDE's diff or
 * nothing.
 */
export function useIdeDiffAvailable(): boolean {
  return useResolvedDiffSurface() === DiffSurface.IDE;
}
