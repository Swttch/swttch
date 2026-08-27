import { useSettings } from '@/contexts/SettingsContext';
import { SettingKey, DiffSurface } from '@/types/settings';

/**
 * Which surface will actually draw the next review diff.
 *
 * Read from the merged settings, never from the scope the settings screen
 * happens to be showing. Those are different questions: the scope view answers
 * "what is written at this level", which is blank for a value the project sets
 * and the user has not overridden globally. Reading it here made the file link
 * open the built-in diff on a project configured for the IDE — while the
 * backend, which merges properly, had opened the IDE one moments earlier, so
 * the same edit ended up reviewed on both surfaces at once (#359).
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
  const { settings, ideAttached } = useSettings();
  if (!ideAttached) return DiffSurface.BUILT_IN;
  return (settings[SettingKey.DIFF_SURFACE] as DiffSurface | undefined) ?? DiffSurface.IDE;
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

/**
 * Whether the review opens by itself when a permission prompt goes up.
 *
 * Off, the prompt stands alone and the review waits to be asked for by clicking
 * the file name in it. That click is a different path and is never gated by
 * this — the change is stored either way, so there is always something to show.
 *
 * Its own name because two sides must agree: this hook, and the backend's own
 * check in preparePermissionReview. They open the review on mutually exclusive
 * occasions, so a gate on one alone would just hand the job to the other (#349).
 */
export function useAutoOpenDiffEnabled(): boolean {
  const { settings } = useSettings();
  // Absent reads as on, which is the behaviour that shipped.
  return settings[SettingKey.AUTO_OPEN_DIFF_ON_PERMISSION] !== false;
}
