import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { MessageType } from '../../shared';
import { loadWorkflowAgentTranscript } from '../features/loadWorkflowAgentTranscript';

/**
 * GET_AGENT_TRANSCRIPT — load one workflow agent's full transcript (raw JSONL
 * entries) for the Background tasks detail modal (issue #347).
 */
export async function getAgentTranscriptHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  try {
    const payload = message.payload as { transcriptDir?: string; agentId?: string } | undefined;
    const transcriptDir = payload?.transcriptDir;
    const agentId = payload?.agentId;
    const result = await loadWorkflowAgentTranscript({
      transcriptDir: transcriptDir ?? '',
      agentId: agentId ?? '',
    });
    connections.sendTo(connectionId, MessageType.ACK, {
      requestId: message.requestId,
      status: 'ok',
      entries: result.entries,
      truncated: result.truncated,
    });
  } catch (err) {
    connections.sendTo(connectionId, MessageType.ACK, {
      requestId: message.requestId,
      status: 'error',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
