import { createContext, useContext, useCallback, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useBridge } from '@/hooks/useBridge';
import { useWorkingDir } from '@/contexts/WorkingDirContext';
import { ModelInfo } from '@/types/slashCommand';
import type { CliConfigControlResponse } from '@/types/slashCommand';
import { MessageType } from '@/shared';

interface CliConfigContextValue {
  controlResponse: CliConfigControlResponse | null;
  isLoading: boolean;
  refresh: () => Promise<void>;
}

const CliConfigContext = createContext<CliConfigContextValue | null>(null);

interface Props {
  children: ReactNode;
}

export function CliConfigProvider(props: Props) {
  const { children } = props;
  const { isConnected, send } = useBridge();
  const { workingDirectory } = useWorkingDir();
  const queryClient = useQueryClient();

  // Key by workingDir so each project's commands/skills are cached separately
  // (the backend is shared across IDE projects). `refresh: true` makes every
  // fetch bypass the backend's per-workingDir cache and respawn the CLI, so a
  // refetch always reflects runtime-added skills (issue #176).
  const { data, isPending } = useQuery<CliConfigControlResponse | null>({
    queryKey: [MessageType.GET_CLI_CONFIG, workingDirectory],
    enabled: isConnected,
    queryFn: async () => {
      const response = await send(MessageType.GET_CLI_CONFIG, {
        workingDir: workingDirectory ?? undefined,
        refresh: true,
      });
      const cr = (response as Record<string, unknown>)?.controlResponse as
        | CliConfigControlResponse
        | undefined;
      if (!cr) {
        console.warn('[CliConfigContext] No controlResponse in response');
        return null;
      }
      // The catalog becomes instances here and nowhere else. This is the first
      // point at which the CLI's JSON exists on this side, so hydrating here is
      // what keeps a plain catalog row from ever reaching a component. Every
      // other level of the envelope is copied through untouched, and each row
      // keeps its original entry inside it (see `ModelInfo.toJSON`).
      //
      // Doing it inside `queryFn` also pins identity: react-query caches this
      // object, so the same instances are handed out until a refetch. The picker
      // ticks the selected row by object identity — a proxy catalog can list one
      // model id in two slots — and rebuilding rows per render would break that.
      return {
        ...cr,
        response: {
          ...cr.response,
          response: {
            ...cr.response.response,
            models: ModelInfo.fromList(cr.response.response?.models),
          },
        },
      };
    },
    // Commands/skills change at runtime, so treat the data as always stale:
    // reopening the panel refetches, while the cached list shows instantly and
    // is quietly replaced when the refetch resolves (stale-while-revalidate).
    staleTime: 0,
    gcTime: 5 * 60 * 1000,
    retry: false,
  });

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: [MessageType.GET_CLI_CONFIG] });
  }, [queryClient]);

  return (
    <CliConfigContext.Provider
      value={{ controlResponse: data ?? null, isLoading: isPending, refresh }}
    >
      {children}
    </CliConfigContext.Provider>
  );
}

export function useCliConfig(): CliConfigContextValue {
  const context = useContext(CliConfigContext);
  if (!context) {
    throw new Error('useCliConfig must be used within a CliConfigProvider');
  }
  return context;
}
