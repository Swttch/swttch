import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { SettingsState, DEFAULT_SETTINGS, SettingKey, ThemeMode, UiDirection } from '@/types/settings';
import { useBridgeContext } from '@/contexts/BridgeContext';
import { useWorkingDir } from '@/contexts/WorkingDirContext';
import { isJetBrains, isMobile, getIdeTheme, subscribeIdeTheme } from '@/config/environment';
import { applyZoom, MOBILE_BASE_ZOOM, ZOOM_DEFAULT } from '@/utils/zoom';
import { MessageType } from '@/shared';

interface SettingsContextValue {
  settings: SettingsState;
  scopeSettings: Partial<SettingsState>;
  isLoading: boolean;
  overrides: string[];
  scope: 'global' | 'project';
  setScope: (scope: 'global' | 'project') => void;
  updateSetting: <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => Promise<void>;
  updateSettingWithScope: <K extends keyof SettingsState>(key: K, value: SettingsState[K], targetScope: 'global' | 'project') => Promise<void>;
  resetToGlobal: <K extends keyof SettingsState>(key: K) => Promise<void>;
  refreshSettings: () => Promise<void>;
  /** Whether an IDE (Kotlin RPC) host is attached to this backend — true even for a
   *  browser tab opened from an IDE session. Settings that defer to the IDE (e.g.
   *  which program opens files) present as fixed/disabled when this is true. */
  ideAttached: boolean;
  /** The attached IDE's product name (e.g. "WebStorm"), or '' when none. */
  ideProduct: string;
}

interface SettingsResponse {
  status?: string;
  settings?: SettingsState;
  overrides?: string[];
  error?: string;
  ideAttached?: boolean;
  ideProduct?: string;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

const STORAGE_KEY = 'claude-code-settings';

/** Read settings from localStorage. Used as react-query placeholderData so the
 * UI paints last-known settings instantly (no flash) while the bridge load runs. */
function readLocalStorageSettings(): SettingsState | undefined {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
  } catch {
    console.warn('Failed to load settings from localStorage');
  }
  return undefined;
}

function writeLocalStorageSettings(settings: SettingsState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* ignore localStorage write error */
  }
}

interface SettingsProviderProps {
  children: ReactNode;
}

export function SettingsProvider({ children }: SettingsProviderProps) {
  const { isConnected, send, subscribe } = useBridgeContext();
  const { workingDirectory } = useWorkingDir();
  const queryClient = useQueryClient();
  const [scope, setScope] = useState<'global' | 'project'>('global');

  const mergedQuery = useQuery<SettingsResponse>({
    queryKey: [MessageType.GET_SETTINGS, 'merged', workingDirectory],
    queryFn: () => send<SettingsResponse>(MessageType.GET_SETTINGS, { workingDir: workingDirectory }),
    enabled: isConnected,
    // localStorage as instant placeholder (prevents flash before bridge load).
    placeholderData: () => {
      const ls = readLocalStorageSettings();
      return ls ? { settings: ls } : undefined;
    },
  });

  const scopeQuery = useQuery<SettingsResponse>({
    queryKey: [MessageType.GET_SETTINGS, scope, workingDirectory],
    queryFn: () => send<SettingsResponse>(MessageType.GET_SETTINGS, { workingDir: workingDirectory, scope }),
    enabled: isConnected,
  });

  const settings = mergedQuery.data?.settings ?? DEFAULT_SETTINGS;
  const overrides = mergedQuery.data?.overrides ?? [];
  const ideAttached = mergedQuery.data?.ideAttached ?? false;
  const ideProduct = mergedQuery.data?.ideProduct ?? '';
  const scopeSettings = scopeQuery.data?.settings ?? {};
  const isLoading = mergedQuery.isLoading && !mergedQuery.data;

  // Apply font size to root element so rem-based sizes scale globally
  useEffect(() => {
    const fontSize = settings[SettingKey.FONT_SIZE];
    if (typeof fontSize === 'number' && Number.isFinite(fontSize)) {
      document.documentElement.style.fontSize = `${fontSize}px`;
    }
  }, [settings]);

  // Apply the UI zoom level (CmdOrCtrl +/- and CmdOrCtrl + wheel). This scales
  // the whole interface, unlike FONT_SIZE above which only scales rem-based
  // text — the two compose, so effective text size is fontSize × zoomLevel.
  // On phones the mobile base zoom is folded in so a user gesture adjusts
  // relative to the phone scale instead of collapsing back to the desktop one.
  useEffect(() => {
    const zoomLevel = settings[SettingKey.ZOOM_LEVEL];
    if (typeof zoomLevel === 'number' && Number.isFinite(zoomLevel)) {
      applyZoom(zoomLevel, isMobile() ? MOBILE_BASE_ZOOM : ZOOM_DEFAULT);
    }
  }, [settings]);

  // Apply chat message line spacing as a CSS variable consumed by streaming.css
  // (`.streaming-message`, streamdown paragraphs/list-items). The `--chat-line-height`
  // fallback in CSS keeps the previous look when the value is unset/invalid.
  useEffect(() => {
    const lineHeight = settings[SettingKey.LINE_HEIGHT];
    if (typeof lineHeight === 'number' && Number.isFinite(lineHeight)) {
      document.documentElement.style.setProperty('--chat-line-height', String(lineHeight));
    }
  }, [settings]);

  // Apply theme to <html> element. Toggles `.dark` class based on theme setting.
  // - LIGHT: explicit light, no `.dark` class
  // - DARK: explicit dark, `.dark` class on
  // - SYSTEM:
  //     * JetBrains: follow IDE LAF (window.__IDE_THEME__) and 'ide-theme-changed' event.
  //       Fall back to matchMedia when LAF hint is missing (e.g. before Kotlin injects it).
  //     * Standalone: follow prefers-color-scheme as before.
  useEffect(() => {
    const theme = settings[SettingKey.THEME];
    const applyDark = () => document.documentElement.classList.add('dark');
    const applyLight = () => document.documentElement.classList.remove('dark');

    if (theme === ThemeMode.DARK) {
      applyDark();
      return;
    }
    if (theme === ThemeMode.LIGHT) {
      applyLight();
      return;
    }

    // SYSTEM mode
    const mq = window.matchMedia('(prefers-color-scheme: dark)');

    if (isJetBrains()) {
      // JetBrains: prefer IDE LAF hint, fall back to matchMedia when missing.
      const resolve = () => {
        const ide = getIdeTheme();
        if (ide === 'dark') return applyDark();
        if (ide === 'light') return applyLight();
        return mq.matches ? applyDark() : applyLight();
      };
      resolve();
      const mqHandler = (e: MediaQueryListEvent) => {
        // Only react to matchMedia when IDE hint is unavailable.
        if (getIdeTheme() !== null) return;
        e.matches ? applyDark() : applyLight();
      };
      mq.addEventListener('change', mqHandler);
      const unsubscribeIde = subscribeIdeTheme(resolve);
      return () => {
        mq.removeEventListener('change', mqHandler);
        unsubscribeIde();
      };
    }

    // Standalone: detect prefers-color-scheme and subscribe to changes
    if (mq.matches) applyDark(); else applyLight();
    const handler = (e: MediaQueryListEvent) => (e.matches ? applyDark() : applyLight());
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [settings]);

  // Apply IDE theme sync to <html> element (issue #267). Toggles the
  // `ide-theme-sync` class, which is what makes the `--ccg-ide-*` variables
  // Kotlin injects actually take effect (see index.css).
  //
  // JetBrains only: in browser mode no colors are injected, so the class would
  // do nothing — we skip it entirely rather than leave a dead marker in the DOM.
  // The `.dark` toggle above still runs independently, so `--ccg-ide-*` misses
  // fall back to the light or dark value that matches the resolved theme.
  useEffect(() => {
    const apply = () => {
      const enabled = settings[SettingKey.SYNC_IDE_THEME] === true && isJetBrains();
      document.documentElement.classList.toggle('ide-theme-sync', enabled);
    };
    apply();
    // Kotlin re-injects colors on every LAF change; re-running keeps the class
    // correct if the attribute only appears once colors are first injected.
    const unsubscribe = subscribeIdeTheme(apply);
    return unsubscribe;
  }, [settings]);

  // Apply UI mirroring to <html> element. Toggles the `dir` attribute based on
  // the uiDirection setting: 'ltr' (default) or 'rtl'.
  useEffect(() => {
    const uiDirection = settings[SettingKey.UI_DIRECTION];
    document.documentElement.setAttribute('dir', uiDirection === UiDirection.RTL ? 'rtl' : 'ltr');
  }, [settings]);

  // External changes pushed by the backend: patch the merged cache and
  // invalidate every GET_SETTINGS variant so scope reads re-sync.
  useEffect(() => {
    if (!isConnected) return;
    const unsubscribe = subscribe(MessageType.SETTINGS_CHANGED, (message) => {
      const payload = message.payload as Record<string, unknown>;
      const newSettings = payload?.settings as SettingsState | undefined;
      const newOverrides = payload?.overrides as string[] | undefined;
      if (newSettings) {
        queryClient.setQueryData<SettingsResponse>(
          [MessageType.GET_SETTINGS, 'merged', workingDirectory],
          (old) => ({ ...old, settings: newSettings, ...(newOverrides ? { overrides: newOverrides } : {}) }),
        );
      }
      // Mark scope variants stale without an immediate refetch — they re-sync on
      // next access, so an external change never triggers a redundant GET.
      queryClient.invalidateQueries({ queryKey: [MessageType.GET_SETTINGS], refetchType: 'none' });
    });
    return unsubscribe;
  }, [isConnected, subscribe, queryClient, workingDirectory]);

  // Optimistically patch the merged cache, persist via bridge, and mirror to
  // localStorage. When the bridge is unavailable, fall back to localStorage only.
  const applyOptimistic = useCallback(
    <K extends keyof SettingsState>(key: K, value: SettingsState[K]): { mergedKey: unknown[]; previous: SettingsResponse | undefined; next: SettingsState } => {
      const mergedKey = [MessageType.GET_SETTINGS, 'merged', workingDirectory];
      const previous = queryClient.getQueryData<SettingsResponse>(mergedKey);
      const next = { ...(previous?.settings ?? DEFAULT_SETTINGS), [key]: value };
      queryClient.setQueryData<SettingsResponse>(mergedKey, (old) => ({ ...old, settings: next }));
      return { mergedKey, previous, next };
    },
    [queryClient, workingDirectory],
  );

  const updateSetting = useCallback(
    async <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => {
      const { mergedKey, previous, next } = applyOptimistic(key, value);
      try {
        if (isConnected) {
          const response = await send<SettingsResponse>(MessageType.SAVE_SETTINGS, { key, value, scope, workingDir: workingDirectory });
          if (response?.status === 'error') throw new Error(response.error || 'Save failed');
          writeLocalStorageSettings(next);
          queryClient.invalidateQueries({ queryKey: [MessageType.GET_SETTINGS] });
          return;
        }
      } catch (error) {
        // Bridge failed: keep the optimistic value but persist to localStorage.
        console.warn('Failed to save setting via bridge, falling back to localStorage:', error);
        writeLocalStorageSettings(next);
        return;
      }
      // Bridge not connected: localStorage fallback (rollback cache if it fails).
      try {
        writeLocalStorageSettings(next);
      } catch {
        queryClient.setQueryData(mergedKey, previous);
      }
    },
    [applyOptimistic, isConnected, send, scope, workingDirectory, queryClient],
  );

  const updateSettingWithScope = useCallback(
    async <K extends keyof SettingsState>(key: K, value: SettingsState[K], targetScope: 'global' | 'project') => {
      const { mergedKey, previous, next } = applyOptimistic(key, value);
      try {
        if (!isConnected) throw new Error('Not connected');
        const response = await send<SettingsResponse>(MessageType.SAVE_SETTINGS, { key, value, scope: targetScope, workingDir: workingDirectory });
        if (response?.status === 'error') throw new Error(response.error || 'Save failed');
        writeLocalStorageSettings(next);
        queryClient.invalidateQueries({ queryKey: [MessageType.GET_SETTINGS] });
      } catch (error) {
        queryClient.setQueryData(mergedKey, previous);
        console.warn('Failed to save setting:', error);
      }
    },
    [applyOptimistic, isConnected, send, workingDirectory, queryClient],
  );

  const resetToGlobal = useCallback(async <K extends keyof SettingsState>(key: K) => {
    if (!isConnected || !workingDirectory) return;
    try {
      await send<SettingsResponse>(MessageType.SAVE_SETTINGS, { key, value: null, scope: 'project', workingDir: workingDirectory });
      queryClient.invalidateQueries({ queryKey: [MessageType.GET_SETTINGS] });
    } catch (error) {
      console.warn('Failed to reset setting to global:', error);
    }
  }, [isConnected, send, workingDirectory, queryClient]);

  const refreshSettings = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: [MessageType.GET_SETTINGS] });
  }, [queryClient]);

  return (
    <SettingsContext.Provider value={{
      settings,
      scopeSettings,
      isLoading,
      overrides,
      scope,
      setScope,
      updateSetting,
      updateSettingWithScope,
      resetToGlobal,
      refreshSettings,
      ideAttached,
      ideProduct,
    }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}

export { SettingsContext };
