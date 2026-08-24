import { useQuery } from '@tanstack/react-query';
import { useBridge } from './useBridge';
import { MessageType } from '@/shared';

interface AgentTranscriptData {
  entries: Record<string, unknown>[];
  truncated: boolean;
}

/**
 * Load one workflow agent's full transcript for the Background tasks detail
 * modal (issue #347). `fingerprint` should change whenever the agent's live
 * stats (tokens/tools/durationMs) change, so a running agent's transcript
 * refetches as WORKFLOW_PROGRESS updates arrive — no separate polling needed.
 */
export function useAgentTranscript(
  transcriptDir: string | undefined,
  agentId: string | undefined,
  fingerprint?: string | number,
) {
  const { send } = useBridge();

  return useQuery({
    queryKey: ['agent-transcript', transcriptDir, agentId, fingerprint],
    queryFn: async (): Promise<AgentTranscriptData> => {
      const res = await send<{
        status: string;
        entries?: Record<string, unknown>[];
        truncated?: boolean;
        error?: string;
      }>(MessageType.GET_AGENT_TRANSCRIPT, { transcriptDir, agentId });
      if (res.status !== 'ok') throw new Error(res.error ?? 'Failed to load transcript');
      return { entries: res.entries ?? [], truncated: !!res.truncated };
    },
    enabled: !!transcriptDir && !!agentId,
    // A short stale window throttles refetch when WORKFLOW_PROGRESS ticks land
    // several times a second, while still following the workflow closely.
    staleTime: 2000,
  });
}
