import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useBridgeContext } from '@/contexts/BridgeContext';
import { useWorkingDir } from '@/contexts/WorkingDirContext';
import { MessageType, type EnvVarOrigin } from '@/shared';

/**
 * Ask the backend where an environment variable is assigned.
 *
 * A user who is told their request authenticated with `ANTHROPIC_API_KEY` still has
 * to find the thing. It might be in a shell startup file they wrote years ago, a
 * project `.env`, Claude's own settings, or nowhere on disk at all. The backend
 * looks rather than guessing, and answers with **locations only** — never the value.
 *
 * Keyed by the working directory as well as the name, since project-scoped files
 * (`.env`, `.claude/settings.json`) are part of the search.
 */
export function useEnvVarOriginsQuery(name: string | null): UseQueryResult<EnvVarOrigin[], Error> {
  const { isConnected, send } = useBridgeContext();
  const { workingDirectory } = useWorkingDir();

  return useQuery<EnvVarOrigin[], Error>({
    queryKey: [MessageType.TRACE_ENV_ORIGIN, name, workingDirectory],
    enabled: isConnected && Boolean(name),
    // Overrides the global staleTime:Infinity. The answer is a fact about files on
    // disk, and the user reading this notice is being told to go edit those files —
    // so the next failure has to re-read them rather than repeat a cached "not found"
    // about a variable they have since moved or removed.
    staleTime: 0,
    queryFn: async () => {
      const result = (await send(MessageType.TRACE_ENV_ORIGIN, {
        name,
        workingDir: workingDirectory ?? undefined,
      })) as { origins?: EnvVarOrigin[] } | undefined;
      // An empty list is a real answer, not a failure: the variable reached the
      // process from the command line, a shell session, or whatever launched the IDE.
      return result?.origins ?? [];
    },
  });
}
