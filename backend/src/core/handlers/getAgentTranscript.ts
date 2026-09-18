import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { MessageType } from '../../shared';
import { loadWorkflowAgentTranscript } from '../features/loadWorkflowAgentTranscript';
import { Claude } from '../claude';

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
    const payload = message.payload as {
      transcriptDir?: string;
      agentId?: string;
      workingDir?: string;
    } | undefined;
    const transcriptDir = payload?.transcriptDir;
    const agentId = payload?.agentId;

    // The transcript is validated against this project's projects root, so the directory has
    // to be this project's. It used to be whichever project last set one, which happened to
    // be right most of the time and silently refused the transcript when it was not.
    await Claude.applyConfigDir(payload?.workingDir);

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
