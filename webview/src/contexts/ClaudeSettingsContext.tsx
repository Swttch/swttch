import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ClaudeSettingsState, DEFAULT_CLAUDE_SETTINGS } from '@/types/claude-settings';
import { useBridgeContext } from '@/contexts/BridgeContext';
import { useWorkingDir } from '@/contexts/WorkingDirContext';
import { MessageType } from '@/shared';
import { isShadowedByProject } from '@/utils/settingsScope';

interface ClaudeSettingsContextValue {
  settings: ClaudeSettingsState;
  scopeSettings: Partial<ClaudeSettingsState>;
  isLoading: boolean;
  overrides: string[];
  scope: 'global' | 'project';
  setScope: (scope: 'global' | 'project') => void;
  updateSetting: <K extends keyof ClaudeSettingsState>(key: K, value: ClaudeSettingsState[K]) => Promise<void>;
  updateSettingWithScope: <K extends keyof ClaudeSettingsState>(key: K, value: ClaudeSettingsState[K], targetScope: 'global' | 'project') => Promise<void>;
  resetToGlobal: <K extends keyof ClaudeSettingsState>(key: K) => Promise<void>;
  refreshSettings: () => Promise<void>;
}

interface ClaudeSettingsResponse {
  status?: string;
  settings?: ClaudeSettingsState;
  overrides?: string[];
  error?: string;
}

const ClaudeSettingsContext = createContext<ClaudeSettingsContextValue | null>(null);

interface ClaudeSettingsProviderProps {
  children: ReactNode;
}

export function ClaudeSettingsProvider({ children }: ClaudeSettingsProviderProps) {
  const { isConnected, send, subscribe } = useBridgeContext();
  const { workingDirectory } = useWorkingDir();
  const queryClient = useQueryClient();
  const [scope, setScope] = useState<'global' | 'project'>('global');

  // queryKey base is the message type itself (see CLAUDE.md consistent-naming).
  // 'merged' is the effective settings the app consumes; the scope variant is the
  // raw per-scope values the settings page edits.
  const mergedKey = [MessageType.GET_CLAUDE_SETTINGS, 'merged', workingDirectory] as const;
  const scopeKey = [MessageType.GET_CLAUDE_SETTINGS, scope, workingDirectory] as const;

  const mergedQuery = useQuery<ClaudeSettingsResponse>({
    queryKey: mergedKey,
    queryFn: () => send<ClaudeSettingsResponse>(MessageType.GET_CLAUDE_SETTINGS, { workingDir: workingDirectory }),
    enabled: isConnected,
  });

  const scopeQuery = useQuery<ClaudeSettingsResponse>({
    queryKey: scopeKey,
    queryFn: () => send<ClaudeSettingsResponse>(MessageType.GET_CLAUDE_SETTINGS, { workingDir: workingDirectory, scope }),
    enabled: isConnected,
  });

  const settings = mergedQuery.data?.settings ?? DEFAULT_CLAUDE_SETTINGS;
  const overrides = mergedQuery.data?.overrides ?? [];
  const scopeSettings = scopeQuery.data?.settings ?? {};
  const isLoading = mergedQuery.isLoading;

  // External changes pushed by the backend: patch the merged cache in place and
  // invalidate every GET_CLAUDE_SETTINGS variant so scope reads re-sync.
  useEffect(() => {
    if (!isConnected) return;
    const unsubscribe = subscribe(MessageType.CLAUDE_SETTINGS_CHANGED, (message) => {
      const payload = message.payload as Record<string, unknown>;
      const newSettings = payload?.settings as ClaudeSettingsState | undefined;
      const newOverrides = payload?.overrides as string[] | undefined;
      if (newSettings) {
        queryClient.setQueryData<ClaudeSettingsResponse>(
          [MessageType.GET_CLAUDE_SETTINGS, 'merged', workingDirectory],
          (old) => ({ ...old, settings: newSettings, ...(newOverrides ? { overrides: newOverrides } : {}) }),
        );
      }
      // Mark scope variants stale without an immediate refetch — they re-sync on
      // next access, so an external change never triggers a redundant GET.
      queryClient.invalidateQueries({ queryKey: [MessageType.GET_CLAUDE_SETTINGS], refetchType: 'none' });
    });
    return unsubscribe;
  }, [isConnected, subscribe, queryClient, workingDirectory]);

  const persist = useCallback(
    async <K extends keyof ClaudeSettingsState>(key: K, value: ClaudeSettingsState[K] | null, targetScope: 'global' | 'project') => {
      const response = await send<ClaudeSettingsResponse>(MessageType.SAVE_CLAUDE_SETTINGS, {
        key, value, scope: targetScope, workingDir: workingDirectory,
      });
      if (response?.status === 'error') throw new Error(response.error || 'Save failed');
    },
    [send, workingDirectory],
  );

  /**
   * Patch the merged cache to show the new value, unless the project overrides the
   * key and the save is going to the global scope — then the project value still
   * wins and nothing the user can see has changed (issue #344).
   */
  const applyOptimistic = useCallback(
    <K extends keyof ClaudeSettingsState>(key: K, value: ClaudeSettingsState[K], targetScope: 'global' | 'project') => {
      const cacheKey = [MessageType.GET_CLAUDE_SETTINGS, 'merged', workingDirectory];
      const previous = queryClient.getQueryData<ClaudeSettingsResponse>(cacheKey);
      if (!isShadowedByProject(key as string, targetScope, previous?.overrides)) {
        queryClient.setQueryData<ClaudeSettingsResponse>(cacheKey, (old) => ({
          ...old,
          settings: { ...(old?.settings ?? DEFAULT_CLAUDE_SETTINGS), [key]: value },
        }));
      }
      return { cacheKey, previous };
    },
    [queryClient, workingDirectory],
  );

  // Update at the current scope with an optimistic merged-cache patch.
  const updateSetting = useCallback(
    async <K extends keyof ClaudeSettingsState>(key: K, value: ClaudeSettingsState[K]) => {
      const { cacheKey, previous } = applyOptimistic(key, value, scope);
      try {
        if (!isConnected) throw new Error('Bridge not connected');
        await persist(key, value, scope);
        queryClient.invalidateQueries({ queryKey: [MessageType.GET_CLAUDE_SETTINGS] });
      } catch (error) {
        queryClient.setQueryData(cacheKey, previous); // rollback
        console.warn('[ClaudeSettingsContext] Failed to save setting:', error);
        throw error;
      }
    },
    [applyOptimistic, queryClient, isConnected, persist, scope],
  );

  const updateSettingWithScope = useCallback(
    async <K extends keyof ClaudeSettingsState>(key: K, value: ClaudeSettingsState[K], targetScope: 'global' | 'project') => {
      const { cacheKey, previous } = applyOptimistic(key, value, targetScope);
      try {
        if (!isConnected) throw new Error('Not connected');
        await persist(key, value, targetScope);
        queryClient.invalidateQueries({ queryKey: [MessageType.GET_CLAUDE_SETTINGS] });
      } catch (error) {
        queryClient.setQueryData(cacheKey, previous);
        console.warn('[ClaudeSettingsContext] Failed to save setting with scope:', error);
      }
    },
    [applyOptimistic, queryClient, isConnected, persist],
  );

  // Remove a project override, reverting to the global value.
  const resetToGlobal = useCallback(async <K extends keyof ClaudeSettingsState>(key: K) => {
    if (!isConnected || !workingDirectory) return;
    try {
      await persist(key, null, 'project');
      queryClient.invalidateQueries({ queryKey: [MessageType.GET_CLAUDE_SETTINGS] });
    } catch (error) {
      console.warn('[ClaudeSettingsContext] Failed to reset setting to global:', error);
    }
  }, [isConnected, persist, workingDirectory, queryClient]);

  const refreshSettings = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: [MessageType.GET_CLAUDE_SETTINGS] });
  }, [queryClient]);

  return (
    <ClaudeSettingsContext.Provider value={{
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
    }}>
      {children}
    </ClaudeSettingsContext.Provider>
  );
}

export function useClaudeSettings(): ClaudeSettingsContextValue {
  const context = useContext(ClaudeSettingsContext);
  if (!context) {
    throw new Error('useClaudeSettings must be used within a ClaudeSettingsProvider');
  }
  return context;
}

/**
 * Claude settings when a provider is mounted, null otherwise.
 *
 * The mirror of [useSettingsOrNull], for consumers that only read a value to
 * refine presentation and have a sane answer without one. Anything that cannot
 * function without these settings should keep using [useClaudeSettings] and fail
 * loudly instead.
 */
export function useClaudeSettingsOrNull(): ClaudeSettingsContextValue | null {
  return useContext(ClaudeSettingsContext);
}

export { ClaudeSettingsContext };
