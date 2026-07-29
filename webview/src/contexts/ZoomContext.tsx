import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSettings } from '@/contexts/SettingsContext';
import { SettingKey } from '@/types/settings';
import { clampZoom, zoomIn, zoomOut, ZOOM_DEFAULT } from '@/utils/zoom';

/** How long the zoom indicator stays up after the last adjustment. */
export const ZOOM_INDICATOR_HOLD_MS = 1500;

interface ZoomContextValue {
  /** The current level; 1 = 100%. */
  level: number;
  /** True while the indicator should be on screen. */
  isIndicatorVisible: boolean;
  zoomIn: () => void;
  zoomOut: () => void;
  reset: () => void;
  /** Keep the indicator up past its timer (e.g. while the pointer is over it). */
  holdIndicator: () => void;
  /** Release a hold and restart the dismiss timer. */
  releaseIndicator: () => void;
  /** Hide immediately, e.g. the user pressed Escape. */
  dismissIndicator: () => void;
}

const ZoomContext = createContext<ZoomContextValue | null>(null);

interface ZoomProviderProps {
  children: ReactNode;
}

/**
 * Owns the zoom level and the visibility of the Chrome-style zoom indicator.
 *
 * The level is persisted through `updateSetting`, but writes are debounced: a
 * wheel gesture fires a burst of events and each save is a bridge round-trip.
 * The on-screen value updates immediately via the optimistic settings cache, so
 * the debounce is invisible to the user.
 */
export function ZoomProvider(props: ZoomProviderProps) {
  const { children } = props;
  const { settings, updateSetting } = useSettings();

  const stored = settings[SettingKey.ZOOM_LEVEL];
  const settingsLevel = typeof stored === 'number' && Number.isFinite(stored) ? clampZoom(stored) : ZOOM_DEFAULT;

  // `level` is state (not derived from `settings`) so a gesture updates the
  // screen the instant it happens — the persisted write is debounced below,
  // and waiting for it to round-trip back through `settings` would make the
  // indicator lag every keystroke of a burst.
  const [level, setLevel] = useState(settingsLevel);
  const levelRef = useRef(level);
  levelRef.current = level;

  const [isIndicatorVisible, setIsIndicatorVisible] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Non-null while our own adjustment's debounced write hasn't landed in
  // `settings` yet, so the sync effect below doesn't clobber it with the
  // stale pre-write value.
  const pendingRef = useRef<number | null>(null);
  // Non-zero while the pointer rests on the indicator, so it cannot vanish
  // out from under a click.
  const holdCountRef = useRef(0);

  // Adopt an externally-changed value (e.g. another tab, or the initial load
  // resolving after this provider's first render) as long as we have no
  // adjustment of our own in flight.
  useEffect(() => {
    if (pendingRef.current !== null) return;
    setLevel(settingsLevel);
    levelRef.current = settingsLevel;
  }, [settingsLevel]);

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const scheduleHide = useCallback(() => {
    clearHideTimer();
    hideTimerRef.current = setTimeout(() => {
      // A hold acquired while the timer ran wins; the release restarts it.
      if (holdCountRef.current > 0) return;
      setIsIndicatorVisible(false);
    }, ZOOM_INDICATOR_HOLD_MS);
  }, [clearHideTimer]);

  /**
   * Show the indicator and (re)start its dismiss timer. Repeated adjustments
   * reuse the same indicator and only update the number — deliberately NOT a
   * toast queue, which would stack one popup per keypress.
   */
  const revealIndicator = useCallback(() => {
    setIsIndicatorVisible(true);
    scheduleHide();
  }, [scheduleHide]);

  const commit = useCallback(
    (next: number) => {
      const clamped = clampZoom(next);
      revealIndicator();
      if (clamped === levelRef.current) return;
      levelRef.current = clamped;
      setLevel(clamped);
      pendingRef.current = clamped;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        const value = pendingRef.current;
        pendingRef.current = null;
        if (value !== null) updateSetting(SettingKey.ZOOM_LEVEL, value);
      }, 200);
    },
    [revealIndicator, updateSetting],
  );

  const handleZoomIn = useCallback(() => commit(zoomIn(levelRef.current)), [commit]);
  const handleZoomOut = useCallback(() => commit(zoomOut(levelRef.current)), [commit]);
  const handleReset = useCallback(() => commit(ZOOM_DEFAULT), [commit]);

  const holdIndicator = useCallback(() => {
    holdCountRef.current += 1;
    clearHideTimer();
  }, [clearHideTimer]);

  const releaseIndicator = useCallback(() => {
    holdCountRef.current = Math.max(0, holdCountRef.current - 1);
    if (holdCountRef.current === 0) scheduleHide();
  }, [scheduleHide]);

  const dismissIndicator = useCallback(() => {
    holdCountRef.current = 0;
    clearHideTimer();
    setIsIndicatorVisible(false);
  }, [clearHideTimer]);

  useEffect(() => {
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  const value = useMemo<ZoomContextValue>(
    () => ({
      level,
      isIndicatorVisible,
      zoomIn: handleZoomIn,
      zoomOut: handleZoomOut,
      reset: handleReset,
      holdIndicator,
      releaseIndicator,
      dismissIndicator,
    }),
    [level, isIndicatorVisible, handleZoomIn, handleZoomOut, handleReset, holdIndicator, releaseIndicator, dismissIndicator],
  );

  return <ZoomContext.Provider value={value}>{children}</ZoomContext.Provider>;
}

export function useZoom(): ZoomContextValue {
  const context = useContext(ZoomContext);
  if (!context) {
    throw new Error('useZoom must be used within a ZoomProvider');
  }
  return context;
}
