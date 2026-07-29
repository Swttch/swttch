import { useCallback, useEffect, useRef } from 'react';
import { useSettings } from '@/contexts/SettingsContext';
import { SettingKey } from '@/types/settings';
import { isMac } from '@/config/environment';
import { clampZoom, zoomIn, zoomOut, ZOOM_DEFAULT } from '@/utils/zoom';

/**
 * True when the event carries the platform's primary shortcut modifier —
 * Command on macOS, Ctrl on Windows/Linux (issue #169).
 *
 * Note the `metaKey` DOM property is NOT "the Windows equivalent of Command":
 * on Windows/Linux it reports the Super (logo) key, which belongs to the
 * desktop environment and must not trigger app shortcuts. Hence the split.
 */
export function hasCmdOrCtrl(e: KeyboardEvent | WheelEvent): boolean {
  return isMac() ? e.metaKey : e.ctrlKey;
}

/**
 * Whether a keydown means "zoom in". Browsers report the `+` key as '=' on an
 * unshifted US layout and as '+' when shifted, and numpad plus as 'Add' on
 * older engines; all spellings count so the gesture works regardless of layout.
 */
export function isZoomInKey(e: KeyboardEvent): boolean {
  return hasCmdOrCtrl(e) && (e.key === '+' || e.key === '=' || e.key === 'Add');
}

/** Whether a keydown means "zoom out" ('-' or numpad minus). */
export function isZoomOutKey(e: KeyboardEvent): boolean {
  return hasCmdOrCtrl(e) && (e.key === '-' || e.key === '_' || e.key === 'Subtract');
}

/** Whether a keydown means "reset zoom to 100%" — CmdOrCtrl+0, as in browsers. */
export function isZoomResetKey(e: KeyboardEvent): boolean {
  return hasCmdOrCtrl(e) && (e.key === '0' || e.key === 'Insert');
}

/**
 * Wire CmdOrCtrl +/-/0 and CmdOrCtrl + wheel to the persisted zoom level.
 *
 * The level is written through `updateSetting`, so it survives reloads and new
 * tabs like any other setting. Writes are debounced because a single wheel
 * gesture emits a burst of events and each save is a bridge round-trip; the
 * visible zoom still updates immediately via the optimistic settings cache.
 */
export function useZoomControls(): void {
  const { settings, updateSetting } = useSettings();

  // Read the level through a ref so the listeners can stay mounted for the
  // lifetime of the app instead of being torn down on every zoom change.
  const levelRef = useRef<number>(ZOOM_DEFAULT);
  const current = settings[SettingKey.ZOOM_LEVEL];
  levelRef.current = typeof current === 'number' && Number.isFinite(current) ? current : ZOOM_DEFAULT;

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<number | null>(null);

  const commit = useCallback(
    (next: number) => {
      const clamped = clampZoom(next);
      if (clamped === levelRef.current) return;
      // Reflect immediately so the gesture feels instant, then persist once the
      // burst settles.
      levelRef.current = clamped;
      pendingRef.current = clamped;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        const value = pendingRef.current;
        pendingRef.current = null;
        if (value !== null) updateSetting(SettingKey.ZOOM_LEVEL, value);
      }, 200);
    },
    [updateSetting],
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isZoomInKey(e)) {
        e.preventDefault();
        commit(zoomIn(levelRef.current));
        return;
      }
      if (isZoomOutKey(e)) {
        e.preventDefault();
        commit(zoomOut(levelRef.current));
        return;
      }
      if (isZoomResetKey(e)) {
        e.preventDefault();
        commit(ZOOM_DEFAULT);
      }
    };

    const handleWheel = (e: WheelEvent) => {
      if (!hasCmdOrCtrl(e)) return;
      // Without preventDefault the browser/JCEF runs its own page zoom on top of
      // ours, compounding the scale. Requires passive: false to take effect.
      e.preventDefault();
      if (e.deltaY === 0) return;
      commit(e.deltaY < 0 ? zoomIn(levelRef.current) : zoomOut(levelRef.current));
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('wheel', handleWheel);
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [commit]);
}
